import React, { useState, useEffect, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "./authConfig";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useGoogleMeet } from "./useGoogleMeet"; 

const API_BASE_URL = "https://testbackend.recruitcrafts.com";
const LOGIN_REQUEST_URL = `${API_BASE_URL}/api/Security/LoginRequest`;
const USER_LOGIN_URL = `${API_BASE_URL}/api/Security/UserLogin`;
const CREATE_MEETING_ENDPOINT = `${API_BASE_URL}/api/CandidatePositionMeeting/Post`;
const SUGGESTION_ENDPOINT = `${API_BASE_URL}/api/CandidatePosition/Suggestion`;

const GOOGLE_CLIENT_ID = "139543619826-ql41ihekmh4d2lhi0p6spsihoio9q55t.apps.googleusercontent.com"; 

const MeetingFormContent = () => {
  const { instance, accounts } = useMsal();
  
  // State'ler
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [systemToken, setSystemToken] = useState(null); 
  const [msToken, setMsToken] = useState(null);         
  const [activeProvider, setActiveProvider] = useState(null); 
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  
  // Arama State'leri
  const [searchTerm, setSearchTerm] = useState("");
  const [allCandidates, setAllCandidates] = useState([]); 
  const [searchResults, setSearchResults] = useState([]); 
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);

  // Form Verileri
  const [formData, setFormData] = useState({
    subject: "", attendeeEmail: "", startDateTime: "", endDateTime: "", description: "",
    tenantId: 244, candidatePositionId: "", userInfoId: 356, selectedCandidateName: "" 
  });

  // Google Hook
  const { login: googleLogin, createMeeting: createGoogleMeeting } = useGoogleMeet(() => {
      setActiveProvider('google');
      setMsToken(null);
      setMessage({ type: "success", text: "✅ Google Bağlandı." });
      fetchAllCandidates();
  });

  // Başlangıç
  useEffect(() => {
    const existingToken = localStorage.getItem("api_token"); 
    if (existingToken) setSystemToken(existingToken);
  }, []);

  // Dropdown Kapatma
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  // --- RECRUITCRAFTS LOGIN ---
  const handleSystemLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    try {
      const reqRes = await fetch(LOGIN_REQUEST_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userInfo: email, password: password }) });
      const reqData = await reqRes.json();
      if (!reqData.success) throw new Error("Kullanıcı adı veya şifre hatalı.");
      
      const tempToken = reqData.data.token;
      const tenantId = reqData.data.tenants?.[0]?.tenantId;
      
      const loginRes = await fetch(USER_LOGIN_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ Token: tempToken, TenantId: tenantId }) });
      const loginData = await loginRes.json();
      
      if (loginData.success) {
        const token = loginData.data?.token || loginData.data;
        localStorage.setItem("api_token", token);
        setSystemToken(token);
        setFormData(prev => ({ ...prev, tenantId: tenantId }));
        setMessage({ type: "success", text: "✅ Giriş Başarılı!" });
      } else { throw new Error("Onay alınamadı."); }
    } catch (err) { setMessage({ type: "error", text: err.message }); } finally { setIsLoading(false); }
  };

  // --- OUTLOOK CONNECT ---
  const handleOutlookConnect = async () => {
    try {
        const response = await instance.loginPopup(loginRequest);
        setMsToken(response.accessToken);
        setActiveProvider('outlook');
        setMessage({ type: "success", text: "✅ Outlook Bağlandı." });
        fetchAllCandidates(); 
    } catch (error) { setMessage({ type: "error", text: "Outlook Hatası." }); }
  };

  // --- ADAYLARI ÇEK ---
  const fetchAllCandidates = async () => {
    if (!localStorage.getItem("api_token") || allCandidates.length > 0) return;
    try {
        const payload = { "pageSize": 100000, "pageNumber": 1, "orderBy": "UpdateDate desc", "includeProperties": "Candidate.Person,CompanyPosition.Company", "companyPositionId": null };
        const response = await fetch(SUGGESTION_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("api_token")}` }, body: JSON.stringify(payload) });
        if (response.status === 401) { setMessage({ type: "error", text: "Oturum doldu." }); setSystemToken(null); return; }
        const data = await response.json();
        const items = data.data || data.result?.items || data.items || [];
        setAllCandidates(items); 
    } catch (error) { console.error(error); }
  };

  useEffect(() => {
    if (searchTerm.length < 1) { setSearchResults([]); return; }
    const filtered = allCandidates.filter(item => {
        const name = item.candidate?.fullName || item.candidate?.person?.fullName || item.name || "";
        return name.toLocaleLowerCase('tr').includes(searchTerm.toLocaleLowerCase('tr'));
    });
    setSearchResults(filtered.slice(0, 50)); 
  }, [searchTerm, allCandidates]);

  const handleSelectCandidate = (item) => {
      const c = item.candidate || {};
      setFormData(prev => ({ ...prev, candidatePositionId: item.id, attendeeEmail: c.email || c.person?.email || "", selectedCandidateName: c.fullName || c.person?.fullName || "İsimsiz" }));
      setSearchTerm(c.fullName || c.person?.fullName || "İsimsiz"); setShowDropdown(false);
  };

  // --- TOPLANTI OLUŞTUR (HIZLANDIRILMIŞ) ---
  const createMeeting = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (!systemToken) throw new Error("Sistem oturumu yok.");
      if (!activeProvider) throw new Error("Takvim seçilmedi.");
      if (!formData.candidatePositionId) throw new Error("Aday seçilmedi.");

      let meetingLink = "Link Yok";

      // A) OUTLOOK (HIZLANDIRILMIŞ POLLING)
      if (activeProvider === 'outlook') {
          let token = msToken;
          if (!token && accounts.length > 0) {
             const res = await instance.acquireTokenSilent({ scopes: ["Calendars.ReadWrite"], account: accounts[0] });
             token = res.accessToken;
          }
          if(!token) throw new Error("Outlook token yok.");

          // 1. Taslak Oluştur (Mail gitmez)
          const draftPayload = {
            subject: formData.subject,
            start: { dateTime: formData.startDateTime, timeZone: "Turkey Standard Time" },
            end: { dateTime: formData.endDateTime, timeZone: "Turkey Standard Time" },
            isOnlineMeeting: true,
            attendees: [] 
          };
          const createRes = await fetch("https://graph.microsoft.com/v1.0/me/events", { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(draftPayload) });
          if(!createRes.ok) throw new Error("Outlook hatası.");
          const eventData = await createRes.json();
          
          // 2. Linki Hızlıca Kontrol Et (Maks 3 kere dene, 500ms arayla)
          let joinUrl = eventData.onlineMeeting?.joinUrl;
          if (!joinUrl) {
              for (let i = 0; i < 3; i++) {
                  await new Promise(r => setTimeout(r, 500)); // 500ms bekle
                  const refreshRes = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventData.id}`, { headers: { "Authorization": `Bearer ${token}` } });
                  if (refreshRes.ok) {
                      const data = await refreshRes.json();
                      if (data.onlineMeeting?.joinUrl) {
                          joinUrl = data.onlineMeeting.joinUrl;
                          break; // Linki bulduk, döngüden çık
                      }
                  }
              }
          }
          meetingLink = joinUrl || "";

          // 3. Güncelle ve Tek Mail Gönder
          const finalDesc = `
            <div style="font-family:Arial;">
                <p>${formData.description || ""}</p><br/><hr/>
                ${joinUrl ? `<h3 style="color:#464775;">Microsoft Teams</h3><a href="${joinUrl}" style="font-size:16px;font-weight:bold;">Toplantıya Katılmak İçin Tıklayın</a>` : "<p>Teams linki oluşturulamadı.</p>"}
            </div>`;
            
          await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventData.id}`, {
              method: "PATCH", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ attendees: [{ emailAddress: { address: formData.attendeeEmail }, type: "required" }], body: { contentType: "HTML", content: finalDesc } })
          });
      }
      
      // B) GOOGLE (HOOK İLE)
      else if (activeProvider === 'google') {
          meetingLink = await createGoogleMeeting({
              subject: formData.subject,
              description: formData.description,
              startDateTime: formData.startDateTime,
              endDateTime: formData.endDateTime,
              attendeeEmail: formData.attendeeEmail
          });
      }

      // C) BACKEND KAYDI
      const backendData = {
        tenantId: Number(formData.tenantId), candidatePositionId: Number(formData.candidatePositionId),
        title: formData.subject, meetingDate: new Date(formData.startDateTime).toISOString(),
        allDay: false, startTime: new Date(formData.startDateTime).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}),
        endTime: new Date(formData.endDateTime).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}),
        color: 1, meetingResult: formData.description || "Planlandı",
        candidatePositionMeetingUsers: [{ userInfoId: Number(formData.userInfoId) }], url: meetingLink || "Link Oluşmadı"
      };
      
      const bRes = await fetch(CREATE_MEETING_ENDPOINT, { 
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${systemToken}` }, body: JSON.stringify(backendData)
      });

      if (bRes.ok) {
        setMessage({ type: "success", text: `🎉 ${activeProvider==='google'?'Google':'Teams'} Toplantısı Kaydedildi!` });
        setFormData(prev => ({ ...prev, subject:"", description:"" }));
      } else { setMessage({ type: "warning", text: "Sistem kaydı başarısız." }); }

    } catch (err) { setMessage({ type: "error", text: "Hata: " + err.message }); } finally { setIsLoading(false); }
  };

  // --- EKRANLAR ---
  if (!systemToken) return (
      <div style={{ padding: "30px", maxWidth: "400px", margin: "50px auto", border: "1px solid #ccc", borderRadius: "8px" }}>
          <h3 style={{textAlign:"center"}}>Sistem Girişi</h3>
          <form onSubmit={handleSystemLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <input type="text" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} required style={{padding:"10px", border:"1px solid #ccc"}} />
              <input type="password" placeholder="Şifre" value={password} onChange={(e)=>setPassword(e.target.value)} required style={{padding:"10px", border:"1px solid #ccc"}} />
              <button type="submit" disabled={isLoading} style={{padding:"12px", background:"#FE6601", color:"white", border:"none", cursor:"pointer"}}>{isLoading?"...":"Giriş Yap"}</button>
          </form>
          {message && <p style={{color:"red", textAlign:"center"}}>{message.text}</p>}
      </div>
  );

  if (!activeProvider) return (
      <div style={{textAlign: "center", marginTop: "50px", padding:"20px", border:"1px solid #eee", borderRadius:"8px", maxWidth:"400px", margin:"50px auto"}}>
          <h3>Takvim Seçimi</h3>
          <div style={{display:"flex", flexDirection:"column", gap:"15px"}}>
            <button onClick={handleOutlookConnect} style={{padding:"14px", background:"#0078d4", color:"white", border:"none", borderRadius:"4px", cursor:"pointer"}}>🟦 Outlook Seç</button>
            <button onClick={() => googleLogin()} style={{padding:"14px", background:"#db4437", color:"white", border:"none", borderRadius:"4px", cursor:"pointer"}}>🟥 Google Seç</button> 
            <button onClick={()=>{localStorage.removeItem("api_token"); setSystemToken(null);}} style={{background:"none", border:"none", textDecoration:"underline", cursor:"pointer", color:"#999"}}>Çıkış</button>
          </div>
          {message && <p style={{color:"red", marginTop:"15px"}}>{message.text}</p>}
      </div>
  );

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "20px auto", border: "1px solid #eee", borderRadius: "8px" }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px", borderBottom:"1px solid #eee", paddingBottom:"10px"}}>
         <div style={{color:"green"}}>{activeProvider==='google'?'🟥 Google':'🟦 Outlook'} Aktif</div>
         <div>
             <button onClick={()=>{setActiveProvider(null);}} style={{background:"#f0ad4e", color:"white", border:"none", padding:"5px 10px", marginRight:"5px", borderRadius:"4px", cursor:"pointer"}}>Değiştir</button>
             <button onClick={()=>{localStorage.removeItem("api_token"); setSystemToken(null); setActiveProvider(null);}} style={{background:"#dc3545", color:"white", border:"none", padding:"5px 10px", borderRadius:"4px", cursor:"pointer"}}>Çıkış</button>
         </div>
      </div>

      <form onSubmit={createMeeting} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{position:"relative"}} ref={searchRef}>
            <input type="text" placeholder="Aday Ara..." value={searchTerm} onChange={(e)=>{setSearchTerm(e.target.value); setShowDropdown(true);}} onFocus={()=>{if(allCandidates.length===0) fetchAllCandidates(); setShowDropdown(true);}} style={{width:"100%", padding:"10px", border:"1px solid #ccc"}} />
            {showDropdown && searchResults.length>0 && (
                <ul style={{position:"absolute", top:"100%", left:0, right:0, background:"white", border:"1px solid #ccc", zIndex:100, padding:0, margin:0, listStyle:"none", maxHeight:"200px", overflowY:"auto"}}>
                    {searchResults.map((item, i) => (
                        <li key={i} onClick={()=>handleSelectCandidate(item)} style={{padding:"10px", borderBottom:"1px solid #eee", cursor:"pointer"}} onMouseEnter={(e)=>e.target.style.background="#f0f8ff"} onMouseLeave={(e)=>e.target.style.background="white"}>
                            {/* --- EMAIL GÖSTERİMİ DÜZELTİLDİ --- */}
                            <strong>{item.candidate?.fullName || item.name}</strong><br/>
                            <small style={{color:"#666"}}>{item.candidate?.email || "Email yok"}</small>
                        </li>
                    ))}
                </ul>
            )}
        </div>
        {formData.selectedCandidateName && <div style={{background:"#e3f2fd", padding:"10px"}}>Seçilen: {formData.selectedCandidateName}</div>}

        <input name="subject" placeholder="Konu" required onChange={handleChange} value={formData.subject} style={{padding:"10px", border:"1px solid #ccc"}} />
        <div style={{display:"flex", gap:"10px"}}>
            <input name="startDateTime" type="datetime-local" required onChange={handleChange} style={{flex:1, padding:"10px", border:"1px solid #ccc"}} />
            <input name="endDateTime" type="datetime-local" required onChange={handleChange} style={{flex:1, padding:"10px", border:"1px solid #ccc"}} />
        </div>
        <textarea name="description" placeholder="Açıklama" rows="3" onChange={handleChange} value={formData.description} style={{padding:"10px", border:"1px solid #ccc"}} />
        <button type="submit" disabled={isLoading} style={{marginTop:"10px", padding:"14px", background: activeProvider === 'google' ? "#db4437" : "#0078d4", color: "white", border: "none", borderRadius: "4px", fontSize:"16px", cursor:"pointer"}}>
            {isLoading ? "Kaydediliyor..." : "Toplantıyı Kaydet"}
        </button>
      </form>
      {message && <p style={{textAlign:"center", color: message.type==="success"?"green":"red"}}>{message.text}</p>}
    </div>
  );
};

export const MeetingFormWrapper = () => {
    return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <MeetingFormContent />
        </GoogleOAuthProvider>
    );
};

export { MeetingFormWrapper as MeetingForm };