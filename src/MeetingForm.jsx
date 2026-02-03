import React, { useState, useEffect, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "./authConfig";

// API URL'leri
const API_BASE_URL = "https://testbackend.recruitcrafts.com";
const LOGIN_REQUEST_URL = `${API_BASE_URL}/api/Security/LoginRequest`;
const USER_LOGIN_URL = `${API_BASE_URL}/api/Security/UserLogin`;
const CREATE_MEETING_ENDPOINT = `${API_BASE_URL}/api/CandidatePositionMeeting/Post`;
const SUGGESTION_ENDPOINT = `${API_BASE_URL}/api/CandidatePosition/Suggestion`; 

export const MeetingForm = () => {
  const { instance, accounts } = useMsal();
  
  // Login State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Token State
  const [systemToken, setSystemToken] = useState(null);
  const [msToken, setMsToken] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  
  // Arama State'leri
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);

  // Form Verileri
  const [formData, setFormData] = useState({
    subject: "",
    attendeeEmail: "", 
    startDateTime: "",
    endDateTime: "",
    description: "",
    tenantId: 244,
    candidatePositionId: "", 
    userInfoId: 356,
    selectedCandidateName: "" 
  });

  // 1. Sistem Token Kontrolü (LocalStorage)
  useEffect(() => {
    const existingToken = localStorage.getItem("api_token"); 
    if (existingToken) setSystemToken(existingToken);
  }, []);

  // 2. Outlook Token Kontrolü (MSAL)
  useEffect(() => {
      if (accounts.length > 0 && !msToken) {
          instance.acquireTokenSilent({
              ...loginRequest,
              account: accounts[0]
          }).then(response => {
              setMsToken(response.accessToken);
          }).catch(err => console.log("Outlook token yenilenemedi:", err));
      }
  }, [accounts, instance, msToken]);

  // Dropdown dışına tıklayınca kapat
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // ----------------------------------------------------------------
  // ADIM 1: OUTLOOK BAĞLANTISI
  // ----------------------------------------------------------------
  const handleOutlookConnect = async () => {
    try {
        const response = await instance.loginPopup(loginRequest);
        setMsToken(response.accessToken);
        setMessage({ type: "success", text: "✅ Outlook Bağlandı! Şimdi sisteme giriş yapın." });
    } catch (error) {
        setMessage({ type: "error", text: "Outlook bağlantısı başarısız." });
    }
  };

  // ----------------------------------------------------------------
  // ADIM 2: SİSTEM GİRİŞİ (RecruitCrafts)
  // ----------------------------------------------------------------
  const handleSystemLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      // 1. Login Request
      const reqRes = await fetch(LOGIN_REQUEST_URL, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ userInfo: email, password: password }) 
      });
      const reqData = await reqRes.json();
      
      if (!reqData.success) throw new Error("Kullanıcı adı veya şifre hatalı.");
      
      const tempToken = reqData.data.token;
      const tenantId = reqData.data.tenants?.[0]?.tenantId;
      
      // 2. User Login
      const loginRes = await fetch(USER_LOGIN_URL, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ Token: tempToken, TenantId: tenantId }) 
      });
      const loginData = await loginRes.json();
      
      if (loginData.success) {
        const token = loginData.data?.token || loginData.data;
        localStorage.setItem("api_token", token);
        setSystemToken(token);
        setFormData(prev => ({ ...prev, tenantId: tenantId }));
        setMessage({ type: "success", text: "✅ Giriş Başarılı!" });
      } else { 
          throw new Error("Giriş onayı alınamadı."); 
      }
    } catch (err) { 
        setMessage({ type: "error", text: err.message }); 
    } finally { 
        setIsLoading(false); 
    }
  };

  // ----------------------------------------------------------------
  // ADAY ARAMA 
  // ----------------------------------------------------------------
  useEffect(() => {
    if (searchTerm.length < 2 || !systemToken || !showDropdown) {
        if(searchTerm.length === 0) setSearchResults([]);
        return;
    }
    const delayDebounceFn = setTimeout(() => { searchCandidates(searchTerm); }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, systemToken]);

  const searchCandidates = async (query) => {
    setIsSearching(true);
    try {
        const payload = {
            "pageSize": 100, 
            "pageNumber": 1, 
            "orderBy": "UpdateDate desc",
            "includeProperties": "Candidate.Person.PersonExpertises.Expertise,Candidate.Person.PersonEducations,Candidate.Person.PersonExperiences,Candidate.CreateBy,CandidatePositionStatus,CompanyPosition.Company,CompanyPosition.CompanyPositionStatus,CreateBy,Candidate.CandidateTagAssignments",
            "companyPositionId": null 
        };

        const response = await fetch(SUGGESTION_ENDPOINT, {
            method: "POST", 
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${systemToken}` },
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            setMessage({ type: "error", text: "Oturum doldu. Tekrar giriş yapın." });
            setSystemToken(null);
            return;
        }

        const data = await response.json();
        const items = data.data || data.result?.items || data.items || [];
        
        // İsme göre filtrele
        const filtered = items.filter(item => {
            const candidate = item.candidate || {};
            // İsim farklı yerlerde olabilir, hepsini kontrol et
            const fullName = candidate.fullName || candidate.person?.fullName || candidate.name || "";
            return fullName.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'));
        });

        setSearchResults(filtered);

    } catch (error) { 
        console.error("Arama Hatası:", error); 
    } finally { 
        setIsSearching(false); 
    }
  };

  const handleSelectCandidate = (item) => {
      const candidate = item.candidate || {};
      const fullName = candidate.fullName || candidate.person?.fullName || candidate.name || "İsimsiz";
      const email = candidate.email || candidate.person?.email || "";
      const targetId = item.id; // Suggestion servisi direkt başvuru ID döner

      setFormData(prev => ({ 
          ...prev, 
          candidatePositionId: targetId, 
          attendeeEmail: email, 
          selectedCandidateName: fullName 
      }));
      setSearchTerm(fullName); 
      setShowDropdown(false);
  };

  // ----------------------------------------------------------------
  // TOPLANTI OLUŞTURMA
  // ----------------------------------------------------------------
  const createMeeting = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (!systemToken) throw new Error("Sistem oturumu yok.");
      if (!formData.candidatePositionId) throw new Error("Lütfen bir aday seçin.");

      let currentMsToken = msToken;
      // Token yoksa sessizce almayı dene
      if (!currentMsToken) {
         const tokenRes = await instance.acquireTokenSilent({ scopes: ["Calendars.ReadWrite"], account: accounts[0] });
         currentMsToken = tokenRes.accessToken;
      }

      // 1. Outlook'a Kaydet
      const outlookPayload = {
        subject: formData.subject,
        body: { contentType: "HTML", content: formData.description },
        start: { dateTime: formData.startDateTime, timeZone: "Turkey Standard Time" },
        end: { dateTime: formData.endDateTime, timeZone: "Turkey Standard Time" },
        attendees: [{ emailAddress: { address: formData.attendeeEmail }, type: "required" }]
      };
      
      const graphRes = await fetch("https://graph.microsoft.com/v1.0/me/events", {
        method: "POST", headers: { "Authorization": `Bearer ${currentMsToken}`, "Content-Type": "application/json" }, body: JSON.stringify(outlookPayload)
      });
      
      if(!graphRes.ok) throw new Error("Outlook kaydı başarısız.");
      const outlookData = await graphRes.json();

      // 2. Sisteme Kaydet
      const backendPayload = {
        tenantId: Number(formData.tenantId), 
        candidatePositionId: Number(formData.candidatePositionId),
        title: formData.subject, 
        meetingDate: new Date(formData.startDateTime).toISOString(),
        allDay: false, 
        startTime: new Date(formData.startDateTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        endTime: new Date(formData.endDateTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        color: 1, 
        meetingResult: formData.description || "Planlandı",
        candidatePositionMeetingUsers: [{ userInfoId: Number(formData.userInfoId) }], 
        url: outlookData.webLink
      };
      
      const backRes = await fetch(CREATE_MEETING_ENDPOINT, { 
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${systemToken}` }, body: JSON.stringify(backendPayload)
      });
      
      if (backRes.ok) {
        setMessage({ type: "success", text: "🎉 Toplantı Başarıyla Oluşturuldu!" });
        setFormData(prev => ({ ...prev, subject:"", description:"" }));
      } else { 
          setMessage({ type: "warning", text: "Sistem kaydı başarısız." }); 
      }
    } catch (err) { setMessage({ type: "error", text: "Hata: " + err.message }); } finally { setIsLoading(false); }
  };

  // --- EKRAN YÖNETİMİ (STATE MACHINE) ---

  // 1. EKRAN: OUTLOOK BAĞLI DEĞİLSE
  if (!msToken && accounts.length === 0) {
      return (
          <div style={{textAlign: "center", marginTop: "50px", padding:"20px", border:"1px solid #eee", borderRadius:"8px", maxWidth:"400px", margin:"50px auto"}}>
              <h3>Adım 1: Outlook Bağlantısı</h3>
              <p>Toplantı oluşturmak için önce Outlook hesabınızı bağlayın.</p>
              <button onClick={handleOutlookConnect} style={{padding:"12px 24px", background:"#0078d4", color:"white", border:"none", borderRadius:"4px", cursor:"pointer", fontSize:"16px"}}>
                  Outlook Bağla
              </button>
              {message && <p style={{color:"red", marginTop:"10px"}}>{message.text}</p>}
          </div>
      );
  }

  // 2. EKRAN: OUTLOOK BAĞLI AMA SİSTEME GİRİŞ YAPILMAMIŞSA
  if (!systemToken) {
      return (
        <div style={{ padding: "30px", maxWidth: "400px", margin: "50px auto", border: "1px solid #ccc", borderRadius: "8px" }}>
            <h3 style={{textAlign:"center", color:"#333"}}>Adım 2: Sisteme Giriş</h3>
            <p style={{textAlign:"center", fontSize:"13px", color:"green"}}>✅ Outlook Bağlandı ({accounts[0]?.username})</p>
            <p style={{textAlign:"center", fontSize:"13px", color:"#666"}}>Şimdi RecruitCrafts hesabınızla giriş yapın.</p>
            
            <form onSubmit={handleSystemLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <input type="text" placeholder="Kullanıcı Adı / E-posta" value={email} onChange={(e) => setEmail(e.target.value)} required style={{padding:"12px", borderRadius:"4px", border:"1px solid #ccc"}} />
                <input type="password" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} required style={{padding:"12px", borderRadius:"4px", border:"1px solid #ccc"}} />
                <button type="submit" disabled={isLoading} style={{ padding: "12px", background: "#FE6601", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight:"bold" }}>{isLoading ? "Giriş Yapılıyor..." : "Giriş Yap"}</button>
            </form>
            {message && <p style={{color: message.type==="success"?"green":"red", textAlign:"center", marginTop:"15px"}}>{message.text}</p>}
        </div>
      );
  }

  // 3. EKRAN: HER ŞEY TAMAM - TOPLANTI FORMU
  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "20px auto", border: "1px solid #eee", borderRadius: "8px" }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px", paddingBottom:"10px", borderBottom:"1px solid #eee"}}>
         <div style={{color:"green", fontSize:"14px"}}>
            ✅ Outlook Aktif<br/>✅ Sistem Aktif
         </div>
         <button onClick={() => { localStorage.removeItem("api_token"); setSystemToken(null); instance.logoutPopup(); }} style={{background:"#dc3545", color:"white", border:"none", padding:"6px 12px", borderRadius:"4px", cursor:"pointer"}}>Çıkış Yap</button>
      </div>

      <form onSubmit={createMeeting} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        
        <label style={{fontWeight:"bold", fontSize:"14px"}}>Aday Ara (İsim Yazın)</label>
        <div style={{position:"relative"}} ref={searchRef}>
            <input 
                type="text" placeholder="Örn: Ahmet..." value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setShowDropdown(true); if(e.target.value==="") setFormData(prev=>({...prev, candidatePositionId:""})); }}
                onFocus={() => setShowDropdown(true)}
                style={{width:"100%", padding:"10px", border:"1px solid #ccc", borderRadius:"4px"}}
            />
            {isSearching && <span style={{position:"absolute", right:"10px", top:"12px", fontSize:"11px", color:"#999"}}>🔍</span>}

            {showDropdown && searchResults.length > 0 && (
                <ul style={{position:"absolute", top:"100%", left:0, right:0, background:"white", border:"1px solid #ccc", zIndex:100, padding:0, margin:0, listStyle:"none", maxHeight:"200px", overflowY:"auto"}}>
                    {searchResults.map((item, idx) => (
                        <li key={idx} onClick={() => handleSelectCandidate(item)} style={{padding:"10px", borderBottom:"1px solid #eee", cursor:"pointer"}} onMouseEnter={(e) => e.target.style.background = "#f0f8ff"} onMouseLeave={(e) => e.target.style.background = "white"}>
                            <div style={{fontWeight:"bold"}}>{item.candidate?.fullName || item.candidate?.person?.fullName || "İsimsiz"}</div>
                            <div style={{fontSize:"11px", color:"#666"}}>{item.candidate?.email || "Email yok"}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>

        {formData.selectedCandidateName && <div style={{background:"#e3f2fd", padding:"10px", borderRadius:"4px", color:"#0d47a1"}}><strong>Seçilen:</strong> {formData.selectedCandidateName}</div>}

        <input name="subject" placeholder="Toplantı Konusu" required onChange={handleChange} value={formData.subject} style={{padding:"10px", border:"1px solid #ccc"}} />
        <div style={{display:"flex", gap:"10px"}}>
            <input name="startDateTime" type="datetime-local" required onChange={handleChange} style={{flex:1, padding:"10px", border:"1px solid #ccc"}} />
            <input name="endDateTime" type="datetime-local" required onChange={handleChange} style={{flex:1, padding:"10px", border:"1px solid #ccc"}} />
        </div>
        <textarea name="description" placeholder="Açıklama" rows="3" onChange={handleChange} value={formData.description} style={{padding:"10px", border:"1px solid #ccc"}} />

        <button type="submit" disabled={isLoading} style={{ marginTop:"10px", padding: "14px", background: "#28a745", color: "white", border: "none", borderRadius: "4px", fontSize:"16px", fontWeight:"bold" }}>
          {isLoading ? "Kaydediliyor..." : "Toplantıyı Kaydet"}
        </button>
      </form>
      {message && <p style={{color: message.type==="success"?"green":"red", textAlign:"center", marginTop:"10px"}}>{message.text}</p>}
    </div>
  );
};