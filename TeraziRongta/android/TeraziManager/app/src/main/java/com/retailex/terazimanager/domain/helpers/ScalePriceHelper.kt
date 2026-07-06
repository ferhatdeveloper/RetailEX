package com.retailex.terazimanager.domain.helpers

import kotlin.math.pow
import kotlin.math.roundToInt

object ScalePriceHelper {
    const val MAX_UNIT_PRICE = 9_999_999

    fun toUnitPrice(price: Double): Int {
        if (price <= 0 || price.isNaN() || price.isInfinite()) return 0
        return price.roundToInt()
    }

    fun parsePriceText(text: String?): Int {
        if (text.isNullOrBlank()) return 0
        val trimmed = text.trim()

        trimmed.toIntOrNull()?.let { return it }

        if ('.' in trimmed && ',' !in trimmed) {
            val digitsOnly = trimmed.replace(".", "")
            if (digitsOnly.isNotEmpty() && digitsOnly.all { it.isDigit() }) {
                digitsOnly.toIntOrNull()?.let { return it }
            }
        }

        trimmed.replace(',', '.').toDoubleOrNull()?.let { return toUnitPrice(it) }
        return 0
    }

    fun toDeviceUnitPrice(apiUnitPrice: Int, deviceDecimalPosition: Int, compensate: Boolean): Int {
        if (apiUnitPrice <= 0 || !compensate) return apiUnitPrice
        val decimals = deviceDecimalPosition.coerceIn(0, 3)
        if (decimals == 0) return apiUnitPrice

        val factor = 10.0.pow(decimals.toDouble()).toInt()
        if (apiUnitPrice > MAX_UNIT_PRICE / factor) return apiUnitPrice
        val scaled = apiUnitPrice.toLong() * factor
        return if (scaled > MAX_UNIT_PRICE) MAX_UNIT_PRICE else scaled.toInt()
    }

    fun fromDeviceUnitPrice(deviceUnitPrice: Int, deviceDecimalPosition: Int, compensate: Boolean): Int {
        if (deviceUnitPrice <= 0 || !compensate) return deviceUnitPrice
        val decimals = deviceDecimalPosition.coerceIn(0, 3)
        if (decimals == 0) return deviceUnitPrice
        return deviceUnitPrice / 10.0.pow(decimals.toDouble()).toInt()
    }
}
