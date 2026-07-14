package app.retailex.mobile.callerid

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

        val incoming =
            intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER).orEmpty().trim()
        val phoneForPush = if (incoming.isBlank()) "unknown" else incoming

        thread(start = true) {
            CallerIdPushClient.sendIncomingCall(
                context = context.applicationContext,
                phone = phoneForPush,
                name = if (incoming.isBlank()) "Incoming Call" else null,
            )
        }
    }
}
