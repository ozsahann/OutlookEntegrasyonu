// src/authConfig.js

export const msalConfig = {
    auth: {
        clientId: "6f3bdd4f-ea44-449d-a80b-895e41738034", //AZURE CLIENT ID
        authority: "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin, 
    },
    cache: {
        cacheLocation: "sessionStorage", 
        storeAuthStateInCookie: false,
    }
};

export const loginRequest = {
  scopes: ["User.Read", "Calendars.ReadWrite"],
};