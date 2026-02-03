// src/App.jsx
import { useState } from 'react'
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "./authConfig";
import { MeetingForm } from "./MeetingForm"; 

function App() {
  const { instance, accounts } = useMsal();
  const [isLoginInProgress, setIsLoginInProgress] = useState(false);

  const handleLogin = async () => {
    setIsLoginInProgress(true);
    try {
      await instance.loginRedirect(loginRequest);
    } catch (error) {
      console.error("Login Hatası:", error);
      setIsLoginInProgress(false);
    }
  };

  const handleLogout = () => {
    instance.logoutPopup();
  };

  const isLoggedIn = accounts.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '50px', fontFamily: 'Arial' }}>
      <h1>Outlook Entegrasyon Testi</h1>
      
      {isLoggedIn ? (
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ color: 'green' }}>✅ Bağlandı: {accounts[0].username}</h3>
          
          <MeetingForm />

          <button 
            onClick={handleLogout}
            style={{ marginTop: "20px", padding: '10px 20px', cursor: 'pointer', backgroundColor: '#d9534f', color: 'white', border: 'none', borderRadius: '5px' }}
          >
            Çıkış Yap
          </button>
        </div>
      ) : (
        <button 
          onClick={handleLogin} 
          disabled={isLoginInProgress}
          style={{ padding: '15px 30px', cursor: 'pointer', backgroundColor: '#0078d4', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px' }}
        >
          {isLoginInProgress ? "Bağlanıyor..." : "Outlook Hesabını Bağla"}
        </button>
      )}
    </div>
  )
}

export default App