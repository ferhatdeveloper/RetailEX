package com.retailex.callerid

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject
import kotlin.concurrent.thread

class NotificationForwardService : NotificationListenerService() {
    private fun isWhatsAppPackage(packageName: String): Boolean {
        return packageName == "com.whatsapp" || packageName == "com.whatsapp.w4b"
    }

    private fun detectWhatsAppEventType(title: String, text: String): String {
        val normalized = (title + " " + text).lowercase()
        val looksLikeCall =
            normalized.contains("call") ||
                normalized.contains("arama") ||
                normalized.contains("voice call") ||
                normalized.contains("video call")
        return if (looksLikeCall) "whatsapp_call" else "whatsapp_message"
    }

    private fun normalizePhone(raw: String): String {
        val keepPlus = raw.trim().startsWith("+")
        val digits = raw.replace(Regex("[^0-9]"), "")
        return if (digits.isBlank()) "" else if (keepPlus) "+$digits" else digits
    }

    private fun extractPhone(title: String, text: String): String? {
        val source = "$title $text"
        val m = Regex("""(\+?\d[\d\s().-]{7,}\d)""").find(source) ?: return null
        val normalized = normalizePhone(m.value)
        return normalized.takeIf { it.length >= 10 }
    }

    private fun bestSenderLabel(title: String, text: String): String {
        val t = title.trim()
        if (t.isNotBlank()) return t
        val x = text.trim()
        if (x.isNotBlank()) return x.take(60)
        return "WhatsApp"
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val n = sbn ?: return
        val packageName = n.packageName.orEmpty()
        if (!isWhatsAppPackage(packageName)) return

        val extras = n.notification.extras ?: return
        val title = extras.getCharSequence("android.title")?.toString().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString().orEmpty()
        if (title.isBlank() && text.isBlank()) return
        val eventType = detectWhatsAppEventType(title, text)
        val senderLabel = bestSenderLabel(title, text)
        val phoneFromText = extractPhone(title, text)
        val phoneFromContacts = if (phoneFromText == null) {
            ContactResolver.resolvePhoneByDisplayName(applicationContext, senderLabel)?.let { normalizePhone(it) }
        } else {
            null
        }
        val phone = when {
            !phoneFromText.isNullOrBlank() -> phoneFromText
            !phoneFromContacts.isNullOrBlank() -> phoneFromContacts
            else -> "wa:$senderLabel"
        }

        thread(start = true) {
            PushClient.sendEvent(
                context = applicationContext,
                phone = phone,
                name = senderLabel,
                eventType = eventType,
                extra = JSONObject()
                    .put("package", packageName)
                    .put("resolvedPhone", phone)
                    .put("title", title.take(80))
                    .put("text", text.take(180)),
            )
        }
    }
}
