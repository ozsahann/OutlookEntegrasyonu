import React, { useState, useEffect, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "./authConfig";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useGoogleMeet } from "./useGoogleMeet"; 

// --- API URL'leri ---
const API_BASE_URL = "https://testbackend.recruitcrafts.com";
const LOGIN_REQUEST_URL = `${API_BASE_URL}/api/Security/LoginRequest`;
const USER_LOGIN_URL = `${API_BASE_URL}/api/Security/UserLogin`;
const CREATE_MEETING_ENDPOINT = `${API_BASE_URL}/api/CandidatePositionMeeting/Post`;
const UPDATE_MEETING_ENDPOINT = `${API_BASE_URL}/api/CandidatePositionMeeting/Put`; 
const SUGGESTION_ENDPOINT = `${API_BASE_URL}/api/CandidatePosition/Suggestion`;

const GOOGLE_CLIENT_ID = "139543619826-ql41ihekmh4d2lhi0p6spsihoio9q55t.apps.googleusercontent.com"; 

const MeetingFormContent = () => {
  const { instance, accounts } = useMsal();
  
  // State Tanımları
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

  // --- TEST İÇİN EKLENEN STATE'LER ---
  const [lastCreatedMeeting, setLastCreatedMeeting] = useState(null); // Son oluşturulan toplantıyı hafızada tutar

  // Düzenleme Modu State'leri
  const [editingMeetingId, setEditingMeetingId] = useState(null); // Backend ID
  const [editingExternalId, setEditingExternalId] = useState(null); // Outlook/Google ID
  const [initialData, setInitialData] = useState({}); // Formun ilk hali (Kıyaslama için)

  const [formData, setFormData] = useState({
    subject: "", attendeeEmail: "", startDateTime: "", endDateTime: "", description: "",
    tenantId: 244, candidatePositionId: "", userInfoId: 356, selectedCandidateName: "" 
  });

  // Google Hook
  const { login: googleLogin, createMeeting: createGoogleMeeting, updateMeeting: updateGoogleMeeting } = useGoogleMeet(() => {
      setActiveProvider('google');
      setMsToken(null);
      setMessage({ type: "success", text: "✅ Google Bağlandı." });
      fetchAllCandidates();
  });

  useEffect(() => {
    const existingToken = localStorage.getItem("api_token"); 
    if (existingToken) setSystemToken(existingToken);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  // --- YARDIMCI FONKSİYON: DEĞİŞENLERİ BUL ---
  const getChangedFields = (initial, current) => {
      const changes = {};
      Object.keys(current).forEach(key => {
          if (current[key] !== initial[key]) {
              changes[key] = current[key];
          }
      });
      return changes;
  };

  // --- TEST: SON OLUŞTURULANI DÜZENLEME MODUNA AL ---
  const handleTestEditClick = () => {
      if (!lastCreatedMeeting) return;

      // Formu son oluşturulan verilerle doldur
      setFormData(lastCreatedMeeting.formData);
      setInitialData(lastCreatedMeeting.formData);
      
      // ID'leri ayarla
      setEditingMeetingId(lastCreatedMeeting.backendId);
      setEditingExternalId(lastCreatedMeeting.externalId);
      
      setMessage({ type: "info", text: "✏️ Düzenleme Modu Aktif: Değişiklik yapıp 'Güncelle'ye basın." });
  };

  // --- TOPLANTI GÜNCELLEME (UPDATE) ---
  const handleUpdateMeeting = async () => {
      if (!editingMeetingId) return;
      setIsLoading(true);

      try {
          // 1. Değişen Alanları Bul
          const changes = getChangedFields(initialData, formData);
          
          if (Object.keys(changes).length === 0) {
              setMessage({ type: "info", text: "⚠️ Hiçbir değişiklik yapmadınız." });
              setIsLoading(false);
              return;
          }

          console.log("Değişen Alanlar:", changes);

          // 2. Outlook veya Google'ı Güncelle
          if (changes.subject || changes.startDateTime || changes.endDateTime || changes.description) {
              
              if (activeProvider === 'outlook' && editingExternalId) {
                  const outlookPayload = {
                      ...(changes.subject && { subject: changes.subject }),
                      ...(changes.description && { body: { contentType: "HTML", content: changes.description } }),
                      ...(changes.startDateTime && { start: { dateTime: changes.startDateTime, timeZone: "Turkey Standard Time" } }),
                      ...(changes.endDateTime && { end: { dateTime: changes.endDateTime, timeZone: "Turkey Standard Time" } })
                  };
                  
                  const graphRes = await fetch(`https://graph.microsoft.com/v1.0/me/events/${editingExternalId}`, {
                      method: "PATCH",
                      headers: { "Authorization": `Bearer ${msToken}`, "Content-Type": "application/json" },
                      body: JSON.stringify(outlookPayload)
                  });
                  
                  if (!graphRes.ok) throw new Error("Outlook takvimi güncellenemedi.");
              } 
              else if (activeProvider === 'google' && editingExternalId) {
                  await updateGoogleMeeting(editingExternalId, formData);
              }
          }

          // 3. Backend'e SADECE DEĞİŞENLERİ Gönder (PUT)
          const backendPayload = {
              id: editingMeetingId, 
              ...changes // Değişen alanları spread ediyoruz
          };

          // Özel alan mapping 
          if (changes.subject) backendPayload.title = changes.subject;
          if (changes.description) backendPayload.meetingResult = changes.description;
          if (changes.startDateTime) backendPayload.meetingDate = new Date(changes.startDateTime).toISOString();
          
          // Zorunlu alanları ekle 
          backendPayload.tenantId = Number(formData.tenantId);
          backendPayload.candidatePositionId = Number(formData.candidatePositionId);

          const putRes = await fetch(`${UPDATE_MEETING_ENDPOINT}/${editingMeetingId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${systemToken}` },
              body: JSON.stringify(backendPayload)
          });

          if (putRes.ok) {
              setMessage({ type: "success", text: "✅ Toplantı Başarıyla Güncellendi!" });
              setEditingMeetingId(null); // Moddan çık
              setLastCreatedMeeting(null); // Test verisini temizle
              setInitialData({});
              setFormData({...formData, subject:"", description:""});
          } else {
              throw new Error("Sistem güncellemesi başarısız oldu.");
          }

      } catch (err) {
          setMessage({ type: "error", text: "Güncelleme Hatası: " + err.message });
      } finally {
          setIsLoading(false);
      }
  };

  // --- YENİ OLUŞTURMA (CREATE) ---
  const createMeeting = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (!systemToken) throw new Error("Sistem oturumu yok.");
      if (!formData.candidatePositionId) throw new Error("Aday seçilmedi.");

      let meetingLink = "Link Yok";
      let externalId = null;

      // A) OUTLOOK
      if (activeProvider === 'outlook') {
          let token = msToken;
          if (!token && accounts.length > 0) {
             const res = await instance.acquireTokenSilent({ scopes: ["Calendars.ReadWrite"], account: accounts[0] });
             token = res.accessToken;
          }
          if(!token) throw new Error("Outlook token yok.");

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
          externalId = eventData.id;

          let joinUrl = eventData.onlineMeeting?.joinUrl;
          if (!joinUrl) {
              for (let i = 0; i < 3; i++) {
                  await new Promise(r => setTimeout(r, 500));
                  const refreshRes = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventData.id}`, { headers: { "Authorization": `Bearer ${token}` } });
                  if (refreshRes.ok) {
                      const data = await refreshRes.json();
                      if (data.onlineMeeting?.joinUrl) { joinUrl = data.onlineMeeting.joinUrl; break; }
                  }
              }
          }
          meetingLink = joinUrl || "";

          const finalDesc = `<div style="font-family:Arial;"><p>${formData.description || ""}</p><br/><hr/>${joinUrl ? `<h3 style="color:#464775;">Microsoft Teams</h3><a href="${joinUrl}" style="font-size:16px;font-weight:bold;">Toplantıya Katılmak İçin Tıklayın</a>` : "<p>Teams linki oluşturulamadı.</p>"}</div>`;
          await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventData.id}`, {
              method: "PATCH", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ attendees: [{ emailAddress: { address: formData.attendeeEmail }, type: "required" }], body: { contentType: "HTML", content: finalDesc } })
          });
      }
      // B) GOOGLE
      else if (activeProvider === 'google') {
          const googleResult = await createGoogleMeeting(formData);
          meetingLink = googleResult.link;
          externalId = googleResult.eventId;
      }

      // C) BACKEND KAYDI
      const backendData = {
        tenantId: Number(formData.tenantId), candidatePositionId: Number(formData.candidatePositionId),
        title: formData.subject, meetingDate: new Date(formData.startDateTime).toISOString(),
        allDay: false, startTime: new Date(formData.startDateTime).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}),
        endTime: new Date(formData.endDateTime).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}),
        color: 1, meetingResult: formData.description || "Planlandı",
        candidatePositionMeetingUsers: [{ userInfoId: Number(formData.userInfoId) }], 
        url: meetingLink || "Link Oluşmadı",
        externalId: externalId
      };
      
      const bRes = await fetch(CREATE_MEETING_ENDPOINT, { 
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${systemToken}` }, body: JSON.stringify(backendData)
      });

      if (bRes.ok) {
        // --- TEST İÇİN: BACKEND'DEN GELEN ID AL ---
        let createdId = null;
        try {
            const resJson = await bRes.json();
            // Backend cevabına göre ID'yi yakala 
            createdId = resJson.data?.id || resJson.id || resJson; 
            console.log("Oluşan Kayıt ID:", createdId);
        } catch(e) { console.log("ID okunamadı"); }

        setMessage({ type: "success", text: `🎉 Kayıt Başarılı! (ID: ${createdId})` });
        
        // --- TEST İÇİN: HAFIZAYA AL ---
        setLastCreatedMeeting({
            backendId: createdId || 0, // ID dönemezse 0 atar (PUT çalışmayabilir)
            externalId: externalId,
            formData: { ...formData }
        });

        // Formu temizle
        setFormData({ ...formData, subject:"", description:"" });

      } else { setMessage({ type: "warning", text: "Sistem kaydı başarısız." }); }

    } catch (err) { setMessage({ type: "error", text: "Hata: " + err.message }); } finally { setIsLoading(false); }
  };

  // --- DİĞER (Login, Search vb. - Aynı) ---
  const handleSystemLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const reqRes = await fetch(LOGIN_REQUEST_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userInfo: email, password: password }) });
      const reqData = await reqRes.json();
      if (!reqData.success) throw new Error("Kullanıcı adı veya şifre hatalı.");
      const tempToken = reqData.data.token;
      const tenantId = reqData.data.tenants?.[0]?.tenantId;
      const loginRes = await fetch(USER_LOGIN_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ Token: tempToken, TenantId: tenantId }) });
      const loginData = await loginRes.json();
      if (loginData.success) {
        localStorage.setItem("api_token", loginData.data?.token || loginData.data);
        setSystemToken(loginData.data?.token || loginData.data);
        setFormData(prev => ({ ...prev, tenantId: tenantId }));
        setMessage({ type: "success", text: "✅ Giriş Başarılı!" });
      }
    } catch (err) { setMessage({ type: "error", text: err.message }); } finally { setIsLoading(false); }
  };

  const handleOutlookConnect = async () => {
    try {
        const response = await instance.loginPopup(loginRequest);
        setMsToken(response.accessToken);
        setActiveProvider('outlook');
        setMessage({ type: "success", text: "✅ Outlook Bağlandı." });
        fetchAllCandidates(); 
    } catch (error) { setMessage({ type: "error", text: "Outlook Hatası." }); }
  };

  const fetchAllCandidates = async () => {
    if (!localStorage.getItem("api_token") || allCandidates.length > 0) return;
    try {
        const payload = { "pageSize": 100000, "pageNumber": 1, "orderBy": "UpdateDate desc", "includeProperties": "Candidate.Person,CompanyPosition.Company", "companyPositionId": null };
        const response = await fetch(SUGGESTION_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("api_token")}` }, body: JSON.stringify(payload) });
        if (response.status === 401) { setMessage({ type: "error", text: "Oturum doldu." }); setSystemToken(null); return; }
        const data = await response.json();
        setAllCandidates(data.data || data.result?.items || data.items || []); 
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

  // --- EKRANLAR ---
  if (!systemToken) return (<div style={{ padding: "30px", maxWidth: "400px", margin: "50px auto", border: "1px solid #ccc", borderRadius: "8px" }}><h3 style={{textAlign:"center"}}>Sistem Girişi</h3><form onSubmit={handleSystemLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}><input type="text" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} required style={{padding:"10px"}} /><input type="password" placeholder="Şifre" value={password} onChange={(e)=>setPassword(e.target.value)} required style={{padding:"10px"}} /><button type="submit" disabled={isLoading} style={{padding:"12px", background:"#FE6601", color:"white", border:"none"}}>{isLoading?"...":"Giriş Yap"}</button></form></div>);

  if (!activeProvider) return (<div style={{textAlign: "center", marginTop: "50px", padding:"20px", border:"1px solid #eee", borderRadius:"8px", maxWidth:"400px", margin:"50px auto"}}><h3>Takvim Seçimi</h3><div style={{display:"flex", flexDirection:"column", gap:"15px"}}><button onClick={handleOutlookConnect} style={{padding:"14px", background:"#0078d4", color:"white", border:"none", borderRadius:"4px"}}>🟦 Outlook Seç</button><button onClick={() => googleLogin()} style={{padding:"14px", background:"#db4437", color:"white", border:"none", borderRadius:"4px"}}>🟥 Google Seç</button></div></div>);

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "20px auto", border: "1px solid #eee", borderRadius: "8px" }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px", borderBottom:"1px solid #eee", paddingBottom:"10px"}}>
         <div style={{color:"green"}}>{activeProvider==='google'?'🟥 Google':'🟦 Outlook'} Aktif</div>
         <button onClick={()=>{localStorage.removeItem("api_token"); setSystemToken(null); setActiveProvider(null);}} style={{background:"#dc3545", color:"white", border:"none", padding:"5px 10px", borderRadius:"4px"}}>Çıkış</button>
      </div>

      {/* --- TEST İÇİN DÜZENLEME BUTONU --- */}
      {lastCreatedMeeting && !editingMeetingId && (
          <div style={{marginBottom:"20px", padding:"10px", background:"#fff3cd", border:"1px solid #ffeeba", borderRadius:"4px", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span style={{fontSize:"13px", color:"#856404"}}><strong>Test Modu:</strong> Son oluşturulan toplantıyı düzenlemek ister misin?</span>
              <button onClick={handleTestEditClick} style={{padding:"5px 10px", background:"#856404", color:"white", border:"none", borderRadius:"4px", cursor:"pointer", fontSize:"12px"}}>Evet, Düzenle</button>
          </div>
      )}

      {/* --- FORM (Kaydet veya Güncelle) --- */}
      <form onSubmit={editingMeetingId ? (e) => { e.preventDefault(); handleUpdateMeeting(); } : createMeeting} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        
        {/* Aday Arama */}
        <div style={{position:"relative"}} ref={searchRef}>
            <input type="text" placeholder="Aday Ara..." value={searchTerm} onChange={(e)=>{setSearchTerm(e.target.value); setShowDropdown(true);}} onFocus={()=>{if(allCandidates.length===0) fetchAllCandidates(); setShowDropdown(true);}} style={{width:"100%", padding:"10px", border:"1px solid #ccc"}} disabled={!!editingMeetingId} />
            {showDropdown && searchResults.length>0 && (
                <ul style={{position:"absolute", top:"100%", left:0, right:0, background:"white", border:"1px solid #ccc", zIndex:100, padding:0, margin:0, listStyle:"none", maxHeight:"200px", overflowY:"auto"}}>
                    {searchResults.map((item, i) => (
                        <li key={i} onClick={()=>handleSelectCandidate(item)} style={{padding:"10px", borderBottom:"1px solid #eee", cursor:"pointer"}} onMouseEnter={(e)=>e.target.style.background="#f0f8ff"} onMouseLeave={(e)=>e.target.style.background="white"}>
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
            <input name="startDateTime" type="datetime-local" required onChange={handleChange} value={formData.startDateTime || ""} style={{flex:1, padding:"10px", border:"1px solid #ccc"}} />
            <input name="endDateTime" type="datetime-local" required onChange={handleChange} value={formData.endDateTime || ""} style={{flex:1, padding:"10px", border:"1px solid #ccc"}} />
        </div>
        <textarea name="description" placeholder="Açıklama" rows="3" onChange={handleChange} value={formData.description} style={{padding:"10px", border:"1px solid #ccc"}} />
        
        <button type="submit" disabled={isLoading} style={{marginTop:"10px", padding:"14px", background: editingMeetingId ? "#f0ad4e" : (activeProvider === 'google' ? "#db4437" : "#0078d4"), color: "white", border: "none", borderRadius: "4px", fontSize:"16px", cursor:"pointer"}}>
            {isLoading ? "İşleniyor..." : (editingMeetingId ? "Güncelle" : "Toplantıyı Kaydet")}
        </button>
        
        {editingMeetingId && (
            <button type="button" onClick={() => { setEditingMeetingId(null); setInitialData({}); setFormData({...formData, subject:"", description:""}); }} style={{background:"gray", color:"white", border:"none", padding:"10px", borderRadius:"4px", cursor:"pointer"}}>İptal</button>
        )}
      </form>
      {message && <p style={{textAlign:"center", color: message.type==="success"?"green":"red", marginTop:"10px"}}>{message.text}</p>}
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