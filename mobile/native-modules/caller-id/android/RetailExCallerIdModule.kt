package app.retailex.mobile.callerid

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class RetailExCallerIdModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "RetailExCallerId"

    @ReactMethod
    fun setConfig(json: String, promise: Promise) {
        try {
            CallerIdPrefs.save(reactContext.applicationContext, json)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CALLER_ID_CONFIG", e.message, e)
        }
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(true)
    }
}
