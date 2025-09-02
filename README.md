# Gmail Reply Webhook – Sidebar

Zmiany względem poprzedniej wersji:
- Panel pojawia się **z boku** (prawy sidebar), nie zasłania całego ekranu.
- URL webhooka jest ustawiony **na sztywno** w `background.js`:
  `https://e6dd35b8037f.ngrok-free.app/webhook/mail/addon`

Reszta działania bez zmian: otwierasz maila → panel wysyła dane do webhooka → pokazuje odpowiedź → Edytuj/Odrzuć/Wyślij.

Instalacja:
- `chrome://extensions` → Developer mode → **Load unpacked** → folder `gmail-reply-webhook-extension-sidebar`.