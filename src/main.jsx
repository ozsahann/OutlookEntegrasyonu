// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { PublicClientApplication, EventType } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./authConfig";

const msalInstance = new PublicClientApplication(msalConfig);

// initialize() işlemi tamamlanmadan uygulamayı ekrana basmıyoruz
msalInstance.initialize().then(() => {

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload.account) {
      const account = event.payload.account;
      msalInstance.setActiveAccount(account);
    }
  });

  // StrictMode KALDIRILDI, doğrudan MsalProvider render ediliyor
  ReactDOM.createRoot(document.getElementById('root')).render(
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
  )
});