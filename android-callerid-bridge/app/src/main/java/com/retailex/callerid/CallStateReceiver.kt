package com.retailex.callerid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import kotlin.concurrent.thread

class CallStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        if (state != TelephonyManager.EXTRA_STATE_RINGING) return

        val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER).orEmpty().trim()
        // Some devices/carriers do not expose incoming number reliably.
        // Send a fallback so Desktop still shows incoming call notification.
        val phoneForPush = if (incomingNumber.isBlank()) "unknown" else incomingNumber

        thread(start = true) {
            val contactName = if (incomingNumber.isBlank()) {
                "Incoming Call"
            } else {
                ContactResolver.resolveDisplayName(context.applicationContext, incomingNumber) ?: "Incoming Call"
            }
            PushClient.sendEvent(
                context = context.applicationContext,
                phone = phoneForPush,
                name = contactName,
                eventType = "incoming_call",
            )
        }
    }
}
