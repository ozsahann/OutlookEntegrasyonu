import React, { useState, useEffect, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "./authConfig";
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

// --- API URL'leri ---
const API_BASE_URL = "https://testbackend.recruitcrafts.com";
const LOGIN_REQUEST_URL = `${API_BASE_URL}/api/Security/LoginRequest`;
const USER_LOGIN_URL = `${API_BASE_URL}/api/Security/UserLogin`;
const CREATE_MEETING_ENDPOINT = `${API_BASE_URL}/api/CandidatePositionMeeting/Post`;
const SUGGESTION_ENDPOINT = `${API_BASE_URL}/api/CandidatePosition/Suggestion`;

// --- GOOGLE CLIENT ID ---
const GOOGLE_CLIENT_ID = "139543619826-ql41ihekmh4d2lhi0p6spsihoio9q55t.apps.googleusercontent.com"; 

// =================================================================
// İÇERİK BİLEŞENİ
// =================================================================
const MeetingFormContent = () => {
  const { instance, accounts } = useMsal();
  
  // State Tanımları
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [systemToken, setSystemToken] = useState(null); 
  const [msToken, setMsToken] = useState(null);         
  const [googleToken, setGoogleToken] = useState(null); 
  const [activeProvider, setActiveProvider] = useState(null); 

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  
  // Arama State'leri
  const [searchTerm, setSearchTerm] = useState("");
  const [allCandidates, setAllCandidates] = useState([]); 
  const [searchResults, setSearchResults] = useState([]); 
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);

  // Form Verileri
  const [formData, setFormData] = useState({
    subject: "", attendeeEmail: "", startDateTime: "", endDateTime: "", description: "",
    tenantId: 244, candidatePositionId: "", userInfoId: 356, selectedCandidateName: "" 
  });

  // Başlangıç Kontrolü
  useEffect(() => {
    const existingToken = localStorage.getItem("api_token"); 
    if (existingToken) setSystemToken(existingToken);
  }, []);

  // Dropdown dışına tıklama
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  // ----------------------------------------------------------------
  // 1. ADIM: SİSTEM GİRİŞİ (RecruitCrafts)
  // ----------------------------------------------------------------
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
        setMessage({ type: "success", text: "✅ Giriş Başarılı! Takvim seçiniz." });
      } else { throw new Error("Onay alınamadı."); }
    } catch (err) { setMessage({ type: "error", text: err.message }); } finally { setIsLoading(false); }
  };

  // ----------------------------------------------------------------
  // 2. ADIM: TAKVİM SEÇİMLERİ
  // ----------------------------------------------------------------
  const handleOutlookConnect = async () => {
    try {
        const response = await instance.loginPopup(loginRequest);
        setMsToken(response.accessToken);
        setActiveProvider('outlook');
        setGoogleToken(null);
        setMessage({ type: "success", text: "✅ Outlook Bağlandı." });
        fetchAllCandidates(); 
    } catch (error) { setMessage({ type: "error", text: "Outlook Hatası." }); }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: (tokenResponse) => {
        setGoogleToken(tokenResponse.access_token);
        setActiveProvider('google');
        setMsToken(null);
        setMessage({ type: "success", text: "✅ Google Bağlandı." });
        fetchAllCandidates();
    },
    onError: () => setMessage({ type: "error", text: "Google Hatası." }),
    scope: "https://www.googleapis.com/auth/calendar.events"
  });

  // ----------------------------------------------------------------
  // 3. ADIM: TÜM ADAYLARI ÇEKME
  // ----------------------------------------------------------------
  const fetchAllCandidates = async () => {
    if (!localStorage.getItem("api_token") || allCandidates.length > 0) return;

    setIsSearching(true);
    try {
        console.log("📥 Tüm aday havuzu çekiliyor...");

        const payload = {
            "pageSize": 100000, 
            "pageNumber": 1,
            "orderBy": "UpdateDate desc",
            "includeProperties": "Candidate.Person.PersonExpertises.Expertise,Candidate.Person.PersonEducations,Candidate.Person.PersonExperiences,Candidate.CreateBy,CandidatePositionStatus,CompanyPosition.Company,CompanyPosition.CompanyPositionStatus,CreateBy,Candidate.CandidateTagAssignments",
            "companyPositionId": null 
        };

        const response = await fetch(SUGGESTION_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("api_token")}`
            },
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            setMessage({ type: "error", text: "Oturum doldu." });
            setSystemToken(null);
            return;
        }

        const data = await response.json();
        const items = data.data || data.result?.items || data.items || [];
        setAllCandidates(items); 

    } catch (error) {
        console.error("Veri Çekme Hatası:", error);
    } finally {
        setIsSearching(false);
    }
  };

  useEffect(() => {
    if (searchTerm.length < 1) {
        setSearchResults([]);
        return;
    }
    const filtered = allCandidates.filter(item => {
        const candidate = item.candidate || {};
        const name = candidate.fullName || candidate.person?.fullName || item.name || "";
        return name.toLocaleLowerCase('tr').includes(searchTerm.toLocaleLowerCase('tr'));
    });
    setSearchResults(filtered.slice(0, 50)); 
  }, [searchTerm, allCandidates]);


  const handleSelectCandidate = (item) => {
      const candidate = item.candidate || {};
      const name = candidate.fullName || candidate.person?.fullName || "İsimsiz";
      const mail = candidate.email || candidate.person?.email || "";
      const targetId = item.id; 

      setFormData(prev => ({ 
          ...prev, 
          candidatePositionId: targetId, 
          attendeeEmail: mail, 
          selectedCandidateName: name 
      }));
      setSearchTerm(name); 
      setShowDropdown(false);
  };

  // ----------------------------------------------------------------
  // 4. ADIM: TOPLANTI OLUŞTURMA (TEK MAİL + DOĞRU LİNK)
  // ----------------------------------------------------------------
  const createMeeting = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (!systemToken) throw new Error("Sistem oturumu yok.");
      if (!activeProvider) throw new Error("Takvim seçilmedi.");
      if (!formData.candidatePositionId) throw new Error("Aday seçilmedi.");

      let meetingLink = "Link Yok";

      // A) OUTLOOK 
      if (activeProvider === 'outlook') {
          let token = msToken;
          if (!token && accounts.length > 0) {
             const res = await instance.acquireTokenSilent({ scopes: ["Calendars.ReadWrite"], account: accounts[0] });
             token = res.accessToken;
          }
          if(!token) throw new Error("Outlook token yok.");

          // 1. ÖNCE KATILIMCI OLMADAN (BOŞ) TOPLANTI OLUŞTUR
          const draftPayload = {
            subject: formData.subject,
            start: { dateTime: formData.startDateTime, timeZone: "Turkey Standard Time" },
            end: { dateTime: formData.endDateTime, timeZone: "Turkey Standard Time" },
            isOnlineMeeting: true,
            attendees: [] 
          };

          const createRes = await fetch("https://graph.microsoft.com/v1.0/me/events", {
            method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(draftPayload)
          });
          
          if(!createRes.ok) throw new Error("Outlook toplantısı başlatılamadı.");
          const eventData = await createRes.json();
          
          // 2. TEAMS LİNKİNİ YAKALA 
          let joinUrl = eventData.onlineMeeting?.joinUrl;
          
          if (!joinUrl) {
              await new Promise(resolve => setTimeout(resolve, 1500)); 
              const refreshRes = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventData.id}`, {
                  headers: { "Authorization": `Bearer ${token}` }
              });
              if(refreshRes.ok) {
                  const refreshedData = await refreshRes.json();
                  joinUrl = refreshedData.onlineMeeting?.joinUrl;
              }
          }

          meetingLink = joinUrl || ""; 

          // 3.KATILIMCIYI EKLE VE LİNKİ GÖM 
          const finalDescription = `
            <div style="font-family: Arial, sans-serif;">
                <p>${formData.description || ""}</p>
                <br/><br/>
                <hr/>
                ${joinUrl ? `
                <h3 style="color: #464775;">Microsoft Teams Toplantısı</h3>
                <p>
                    <b>Bilgisayarınızda veya mobil uygulamanızda katılın</b><br/>
                    <a href="${joinUrl}" style="font-size: 16px; font-weight: bold; color: #6264A7; text-decoration: underline;">Toplantıya katılmak için buraya tıklayın</a>
                </p>` : `<p style="color:red; font-weight:bold;">UYARI: Teams linki oluşturulamadı. Lütfen göndericiden linki talep ediniz.</p>`}
            </div>
          `;

          await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventData.id}`, {
              method: "PATCH",
              headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                  attendees: [{ emailAddress: { address: formData.attendeeEmail }, type: "required" }], // Şimdi davet et
                  body: {
                      contentType: "HTML",
                      content: finalDescription // Linki ekle
                  }
              })
          });
          console.log("✅ Toplantı güncellendi ve tek davet gönderildi.");
      }
      
      // B) GOOGLE (MEET)
      else if (activeProvider === 'google') {
          if(!googleToken) throw new Error("Google token yok.");
          const googleData = {
              summary: formData.subject, description: formData.description,
              start: { dateTime: new Date(formData.startDateTime).toISOString(), timeZone: "Europe/Istanbul" },
              end: { dateTime: new Date(formData.endDateTime).toISOString(), timeZone: "Europe/Istanbul" },
              attendees: [{ email: formData.attendeeEmail }],
              conferenceData: { createRequest: { requestId: Math.random().toString(36).substring(7), conferenceSolutionKey: { type: "hangoutsMeet" } } }
          };
          const gRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
              method: "POST", headers: { "Authorization": `Bearer ${googleToken}`, "Content-Type": "application/json" }, body: JSON.stringify(googleData)
          });
          if(!gRes.ok) throw new Error("Google başarısız.");
          const gJson = await gRes.json();
          meetingLink = gJson.hangoutLink;
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

  // =================================================================
  // EKRAN YÖNETİMİ
  // =================================================================

  // 1. SİSTEM GİRİŞİ
  if (!systemToken) {
      return (
        <div style={{ padding: "30px", maxWidth: "400px", margin: "50px auto", border: "1px solid #ccc", borderRadius: "8px" }}>
            <h3 style={{textAlign:"center"}}>Sistem Girişi</h3>
            <p style={{textAlign:"center", color:"#666", fontSize:"13px"}}>RecruitCrafts hesabınızla giriş yapın.</p>
            <form onSubmit={handleSystemLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <input type="text" placeholder="Kullanıcı Adı / Email" value={email} onChange={(e)=>setEmail(e.target.value)} required style={{padding:"12px", border:"1px solid #ccc", borderRadius:"4px"}} />
                <input type="password" placeholder="Şifre" value={password} onChange={(e)=>setPassword(e.target.value)} required style={{padding:"12px", border:"1px solid #ccc", borderRadius:"4px"}} />
                <button type="submit" disabled={isLoading} style={{padding:"12px", background:"#FE6601", color:"white", border:"none", cursor:"pointer", fontWeight:"bold", borderRadius:"4px"}}>{isLoading?"Giriş...":"Giriş Yap"}</button>
            </form>
            {message && <p style={{color:"red", textAlign:"center", marginTop:"10px"}}>{message.text}</p>}
        </div>
      );
  }

  // 2. TAKVİM SEÇİMİ
  if (!activeProvider) {
      return (
          <div style={{textAlign: "center", marginTop: "50px", padding:"20px", border:"1px solid #eee", borderRadius:"8px", maxWidth:"400px", margin:"50px auto"}}>
              <h3 style={{color:"green"}}>✅ Giriş Başarılı</h3>
              <p>Toplantı nerede oluşturulsun?</p>
              <div style={{display:"flex", flexDirection:"column", gap:"15px", marginTop:"10px"}}>
                <button onClick={handleOutlookConnect} style={{padding:"14px", background:"#0078d4", color:"white", border:"none", borderRadius:"4px", cursor:"pointer", fontSize:"16px", fontWeight:"bold"}}>🟦 Outlook Seç</button>
                <button onClick={() => googleLogin()} style={{padding:"14px", background:"#db4437", color:"white", border:"none", borderRadius:"4px", cursor:"pointer", fontSize:"16px", fontWeight:"bold"}}>🟥 Google Seç</button>
                <button onClick={()=>{localStorage.removeItem("api_token"); setSystemToken(null);}} style={{marginTop:"10px", background:"none", border:"none", textDecoration:"underline", cursor:"pointer", color:"#999"}}>Çıkış Yap</button>
              </div>
              {message && <p style={{color:"red", marginTop:"15px"}}>{message.text}</p>}
          </div>
      );
  }

  // 3. TOPLANTI FORMU
  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "20px auto", border: "1px solid #eee", borderRadius: "8px" }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px", borderBottom:"1px solid #eee", paddingBottom:"10px"}}>
         <div style={{fontSize:"14px", color:"green"}}>{activeProvider==='google'?'🟥 Google':'🟦 Outlook'} Aktif</div>
         <div>
             <button onClick={()=>{setActiveProvider(null);}} style={{background:"#f0ad4e", color:"white", border:"none", padding:"5px 10px", borderRadius:"4px", cursor:"pointer", marginRight:"5px"}}>Değiştir</button>
             <button onClick={()=>{localStorage.removeItem("api_token"); setSystemToken(null); setActiveProvider(null);}} style={{background:"#dc3545", color:"white", border:"none", padding:"5px 10px", borderRadius:"4px", cursor:"pointer"}}>Çıkış</button>
         </div>
      </div>

      <form onSubmit={createMeeting} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        
        <label style={{fontWeight:"bold"}}>Aday Ara (Tüm Liste)</label>
        <div style={{position:"relative"}} ref={searchRef}>
            <input 
                type="text" 
                placeholder="İsim yazın..." 
                value={searchTerm} 
                onChange={(e)=>{setSearchTerm(e.target.value); setShowDropdown(true);}} 
                onFocus={() => {
                    if(allCandidates.length === 0) fetchAllCandidates(); 
                    setShowDropdown(true);
                }} 
                style={{width:"100%", padding:"10px", border:"1px solid #ccc", borderRadius:"4px"}} 
            />
            {isSearching && <span style={{position:"absolute", right:"10px", top:"12px", fontSize:"11px", color:"orange"}}>Liste yükleniyor...</span>}

            {showDropdown && searchResults.length>0 && (
                <ul style={{position:"absolute", top:"100%", left:0, right:0, background:"white", border:"1px solid #ccc", zIndex:100, padding:0, margin:0, listStyle:"none", maxHeight:"200px", overflowY:"auto"}}>
                    {searchResults.map((item, i) => (
                        <li key={i} onClick={()=>handleSelectCandidate(item)} style={{padding:"10px", borderBottom:"1px solid #eee", cursor:"pointer"}} onMouseEnter={(e)=>e.target.style.background="#f0f8ff"} onMouseLeave={(e)=>e.target.style.background="white"}>
                            <strong>{item.candidate?.fullName || item.name}</strong><br/><small>{item.candidate?.email}</small>
                        </li>
                    ))}
                </ul>
            )}
            
            {showDropdown && searchResults.length === 0 && searchTerm.length > 1 && !isSearching && (
                 <div style={{position:"absolute", top:"100%", left:0, right:0, background:"white", padding:"10px", border:"1px solid #ccc", zIndex:100}}>
                    {allCandidates.length > 0 ? "Eşleşen aday bulunamadı." : "Liste yükleniyor, bekleyin..."}
                 </div>
            )}
        </div>
        
        {formData.selectedCandidateName && <div style={{background:"#e3f2fd", padding:"10px", borderRadius:"4px", color:"#0d47a1"}}>Seçilen: {formData.selectedCandidateName}</div>}

        <input name="subject" placeholder="Toplantı Konusu" required onChange={handleChange} value={formData.subject} style={{padding:"10px", border:"1px solid #ccc", borderRadius:"4px"}} />
        <div style={{display:"flex", gap:"10px"}}>
            <input name="startDateTime" type="datetime-local" required onChange={handleChange} style={{flex:1, padding:"10px", border:"1px solid #ccc", borderRadius:"4px"}} />
            <input name="endDateTime" type="datetime-local" required onChange={handleChange} style={{flex:1, padding:"10px", border:"1px solid #ccc", borderRadius:"4px"}} />
        </div>
        <textarea name="description" placeholder="Açıklama" rows="3" onChange={handleChange} value={formData.description} style={{padding:"10px", border:"1px solid #ccc", borderRadius:"4px"}} />
        <button type="submit" disabled={isLoading} style={{marginTop:"10px", padding:"14px", background: activeProvider === 'google' ? "#db4437" : "#0078d4", color: "white", border: "none", borderRadius: "4px", fontSize:"16px", cursor:"pointer", fontWeight:"bold"}}>
            {isLoading ? "Kaydediliyor..." : `${activeProvider === 'google' ? 'Google' : 'Outlook'} Toplantısı Oluştur`}
        </button>
      </form>
      {message && <p style={{textAlign:"center", color: message.type==="success"?"green":"red", marginTop:"10px"}}>{message.text}</p>}
    </div>
  );
};

// =================================================================
// KAPSAYICI BİLEŞEN
// =================================================================
export const MeetingFormWrapper = () => {
    return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <MeetingFormContent />
        </GoogleOAuthProvider>
    );
};

export { MeetingFormWrapper as MeetingForm };