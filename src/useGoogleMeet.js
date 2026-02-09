import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';

export const useGoogleMeet = (onLoginSuccess) => {
    const [googleToken, setGoogleToken] = useState(null);

    const login = useGoogleLogin({
        onSuccess: (tokenResponse) => {
            setGoogleToken(tokenResponse.access_token);
            if (onLoginSuccess) onLoginSuccess();
        },
        onError: (error) => console.error("Google Bağlantı Hatası:", error),
        scope: "https://www.googleapis.com/auth/calendar.events"
    });

    // Toplantı Oluşturma
    const createMeeting = async (meetingDetails) => {
        if (!googleToken) throw new Error("Google oturumu yok. Lütfen tekrar bağlanın.");

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
            headers: { "Authorization": `Bearer ${googleToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`Google API Hatası: ${errData.error?.message || "Bilinmiyor"}`);
        }

        const data = await response.json();
        // Hem linki hem de ID'yi dönüyoruz
        return { link: data.hangoutLink, eventId: data.id };
    };

    // Toplantı Güncelleme
    const updateMeeting = async (eventId, meetingDetails) => {
        if (!googleToken) throw new Error("Google oturumu yok.");

        const { subject, description, startDateTime, endDateTime, attendeeEmail } = meetingDetails;

        // Sadece dolu olan alanları gönderiyoruz (Undefined olanlar JSON'a girmez)
        const payload = {
            summary: subject,
            description: description,
            // Tarih değiştiyse formatla, değişmediyse undefined bırak
            start: startDateTime ? { dateTime: new Date(startDateTime).toISOString(), timeZone: "Europe/Istanbul" } : undefined,
            end: endDateTime ? { dateTime: new Date(endDateTime).toISOString(), timeZone: "Europe/Istanbul" } : undefined,
            attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined
        };

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
            method: "PATCH", // Değişiklikleri uygula
            headers: { "Authorization": `Bearer ${googleToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Google toplantısı güncellenemedi.");
        return await response.json();
    };

    return { login, createMeeting, updateMeeting, isConnected: !!googleToken };
};