import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';

export const useGoogleMeet = (onLoginSuccess) => {
    const [googleToken, setGoogleToken] = useState(null);

    // Google Giriş
    const login = useGoogleLogin({
        onSuccess: (tokenResponse) => {
            setGoogleToken(tokenResponse.access_token);
            if (onLoginSuccess) {
                onLoginSuccess();
            }
        },
        onError: (error) => console.error("Google Bağlantı Hatası:", error),
        scope: "https://www.googleapis.com/auth/calendar.events"
    });

    // Toplantı Oluşturma
    const createMeeting = async (meetingDetails) => {
        if (!googleToken) throw new Error("Google oturumu bulunamadı. Lütfen tekrar bağlanın.");

        const { subject, description, startDateTime, endDateTime, attendeeEmail } = meetingDetails;

        const payload = {
            summary: subject,
            description: description,
            start: { dateTime: new Date(startDateTime).toISOString(), timeZone: "Europe/Istanbul" },
            end: { dateTime: new Date(endDateTime).toISOString(), timeZone: "Europe/Istanbul" },
            attendees: [{ email: attendeeEmail }],
            conferenceData: {
                createRequest: {
                    requestId: Math.random().toString(36).substring(7),
                    conferenceSolutionKey: { type: "hangoutsMeet" }
                }
            }
        };

        const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${googleToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`Google API Hatası: ${errData.error?.message || "Bilinmiyor"}`);
        }

        const data = await response.json();
        return data.hangoutLink; // Meet linkini döndür
    };

    return {
        login,
        createMeeting,
        isConnected: !!googleToken,
        token: googleToken
    };
};