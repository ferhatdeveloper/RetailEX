package com.retailex.callerid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import org.json.JSONObject
import kotlin.concurrent.thread

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isEmpty()) return

        val sender = messages.firstOrNull()?.displayOriginatingAddress.orEmpty()
        val body = messages.joinToString(separator = " ") { it.messageBody.orEmpty() }
        if (sender.isBlank()) return

        thread(start = true) {
            val contactName = ContactResolver.resolveDisplayName(context.applicationContext, sender)
            PushClient.sendEvent(
                context = context.applicationContext,
                phone = sender,
                name = contactName ?: "SMS",
                eventType = "sms_received",
                extra = JSONObject().put("body", body.take(200)),
            )
        }
    }
}
