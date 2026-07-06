package com.retailex.terazimanager.data.api

import com.retailex.terazimanager.config.AppConfig
import com.retailex.terazimanager.domain.helpers.ScalePriceHelper
import com.retailex.terazimanager.domain.models.ScaleProductDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class RetailExApiClient(
    private val http: OkHttpClient = defaultClient(),
) {
    suspend fun fetchScaleProducts(config: AppConfig): List<ScaleProductDto> = withContext(Dispatchers.IO) {
        val paths = buildPaths(config)
        var lastError: Exception? = null

        for (path in paths) {
            try {
                val body = RetailExHttp.get(config, path, http)
                val products = filterScaleProducts(parseProducts(body, config.lfCodeBase))
                if (products.isNotEmpty()) return@withContext products
                lastError = IllegalStateException("Endpoint boş veya tartılı ürün yok: $path")
            } catch (ex: Exception) {
                lastError = ex
            }
        }
        throw lastError ?: IllegalStateException("RetailEX API'den tartılabilir ürün alınamadı.")
    }

    suspend fun testConnection(config: AppConfig): Boolean = runCatching {
        fetchScaleProducts(config).isNotEmpty()
    }.getOrDefault(false)

    private fun buildPaths(config: AppConfig): List<String> {
        val paths = mutableListOf<String>()
        config.productsPath.trim().takeIf { it.isNotEmpty() }?.let {
            paths.add(if (it.startsWith("/")) it else "/$it")
        }
        val firmPath = AppConfig.buildProductsPath(config.firmNr)
        if (paths.none { it.equals(firmPath, ignoreCase = true) }) paths.add(firmPath)
        return paths
    }

    companion object {
        private val weightUnits = setOf(
            "KG", "KILOGRAM", "KGM", "G", "GRAM", "GR", "LT", "LITRE", "LITER", "L"
        )

        fun parseProducts(json: String, lfCodeBase: Int): List<ScaleProductDto> {
            if (json.isBlank()) return emptyList()
            val root = runCatching { JSONObject(json) }.getOrNull()
            val rows: JSONArray = when {
                json.trimStart().startsWith("[") -> JSONArray(json)
                root?.optJSONArray("rows") != null -> root.getJSONArray("rows")
                root?.optJSONArray("products") != null -> root.getJSONArray("products")
                root?.optJSONArray("data") != null -> root.getJSONArray("data")
                root?.optJSONArray("items") != null -> root.getJSONArray("items")
                else -> return emptyList()
            }

            val list = mutableListOf<ScaleProductDto>()
            var rank = 1
            for (i in 0 until rows.length()) {
                val item = rows.optJSONObject(i) ?: continue
                mapRow(item, rank++, lfCodeBase)?.let { list.add(it) }
            }
            return list
        }

        fun filterScaleProducts(products: List<ScaleProductDto>): List<ScaleProductDto> =
            products.filter { it.name.isNotBlank() && isWeightUnit(it.unit) }

        fun parsePrice(row: JSONObject): Double {
            val keys = if (isRexProductRow(row)) {
                arrayOf("price", "unit_price", "unitPrice", "sale_price", "salePrice")
            } else {
                arrayOf("sale_price", "salePrice", "price", "unit_price", "unitPrice")
            }
            for (key in keys) {
                if (!row.has(key) || row.isNull(key)) continue
                val token = row.get(key)
                when (token) {
                    is Number -> return ScalePriceHelper.toUnitPrice(token.toDouble()).toDouble()
                    else -> ScalePriceHelper.parsePriceText(token.toString()).takeIf { it > 0 }?.toDouble()?.let {
                        return ScalePriceHelper.toUnitPrice(it).toDouble()
                    }
                }
            }
            return 0.0
        }

        private fun isRexProductRow(row: JSONObject): Boolean =
            row.has("firm_nr") || row.has("is_scale_product") || row.has("price")

        private fun mapRow(row: JSONObject, rank: Int, lfCodeBase: Int): ScaleProductDto? {
            if (!isWeighableRow(row)) return null

            var name = firstString(row, "name", "item_name", "product_name", "PluName", "title").orEmpty()
            if (name.isBlank()) return null
            if (name.length > 36) name = name.substring(0, 36)

            val unit = firstString(row, "unit", "weight_unit", "measure_unit") ?: "KG"
            if (!isWeightUnit(unit)) return null

            val price = parsePrice(row)
            val barcode = firstString(row, "barcode", "barcode_no", "ean", "barcode_number")
            val pluCode = firstString(row, "plu_code", "pluCode", "code", "sku") ?: barcode
            val lfCode = resolveStableLfCode(row, pluCode, lfCodeBase, rank)

            return ScaleProductDto(
                name = name,
                price = ScalePriceHelper.toUnitPrice(price).toDouble(),
                pluCode = pluCode,
                barcode = barcode ?: pluCode,
                unit = normalizeUnit(unit),
                barcodeType = parseInt(row, "barcode_type", "barcodeType", "BarCode", 99),
                department = parseInt(row, "department", "department_id", "Deptment", 21),
                lfCode = lfCode,
                externalId = firstString(row, "id", "item_id", "product_id"),
            )
        }

        private fun isWeighableRow(row: JSONObject): Boolean {
            row.opt("is_scale_product")?.let { return parseBool(it) }
            row.opt("weighable")?.let { return parseBool(it) }
            row.opt("is_weighable")?.let { return parseBool(it) }
            return true
        }

        private fun parseBool(token: Any?): Boolean = when (token) {
            is Boolean -> token
            else -> token.toString().trim().let {
                it.equals("true", true) || it == "1" || it.equals("yes", true)
            }
        }

        fun isWeightUnit(unit: String?): Boolean {
            if (unit.isNullOrBlank()) return false
            val normalized = unit.trim().uppercase().replace(".", "").replace(" ", "")
            if (weightUnits.contains(normalized)) return true
            return normalized.startsWith("KILO") || normalized.startsWith("GRAM") || normalized.startsWith("LIT")
        }

        private fun normalizeUnit(unit: String): String {
            val normalized = unit.trim().uppercase().replace(".", "").replace(" ", "")
            return when {
                normalized.startsWith("KILO") || normalized == "KGM" -> "KG"
                normalized.startsWith("GRAM") || normalized == "GR" || normalized == "G" -> "G"
                normalized.startsWith("LIT") || normalized == "L" -> "LT"
                else -> normalized
            }
        }

        private fun resolveStableLfCode(row: JSONObject, pluCode: String?, lfCodeBase: Int, rank: Int): Int {
            pluCode?.let {
                val digits = it.filter { ch -> ch.isDigit() }
                if (digits.isNotEmpty() && digits.length <= 6) {
                    digits.toIntOrNull()?.takeIf { v -> v > 0 }?.let { return it }
                }
            }
            firstString(row, "id", "item_id", "product_id")?.toIntOrNull()?.takeIf { it in 1..999999 }?.let {
                return it
            }
            return rank
        }

        private fun firstString(row: JSONObject, vararg keys: String): String? {
            for (key in keys) {
                val value = row.optString(key, "").trim()
                if (value.isNotEmpty() && value != "null") return value
            }
            return null
        }

        private fun parseInt(row: JSONObject, k1: String, k2: String, k3: String, fallback: Int): Int {
            row.optString(k1).toIntOrNull()?.let { return it }
            row.optString(k2).toIntOrNull()?.let { return it }
            row.optString(k3).toIntOrNull()?.let { return it }
            return fallback
        }

        private fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
    }
}

internal object RetailExHttp {
    private val jsonMedia = "application/json".toMediaType()

    fun get(config: AppConfig, path: String, client: OkHttpClient): String {
        val baseUrl = config.resolvedApiUrl()
        require(baseUrl.isNotBlank()) { "API adresi yapılandırılmamış." }
        val url = baseUrl.trimEnd('/') + if (path.startsWith("/")) path else "/$path"

        val strategies = authStrategies(config)
        var lastError: Exception? = null

        for (strategy in strategies) {
            try {
                val builder = Request.Builder().url(url).get()
                    .header("Accept", "application/json")
                    .header("Prefer", "return=representation")
                applyAuth(builder, config.apiToken, strategy)

                client.newCall(builder.build()).execute().use { response ->
                    val body = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        lastError = IllegalStateException(
                            "RetailEX API (${response.code}) $path: ${truncate(body, 220)}"
                        )
                        if (response.code == 404 || response.code == 400) throw lastError!!
                        return@use
                    }
                    return body
                }
            } catch (ex: Exception) {
                if (ex is IllegalStateException) throw ex
                lastError = ex
            }
        }
        throw lastError ?: IllegalStateException("RetailEX API isteği başarısız: $path")
    }

    private enum class AuthStrategy { NONE, BEARER, API_KEY }

    private fun authStrategies(config: AppConfig): List<AuthStrategy> {
        val mode = config.authMode.lowercase()
        val placeholder = AppConfig.isPlaceholderToken(config.apiToken)
        return when (mode) {
            "none" -> listOf(AuthStrategy.NONE)
            "bearer" -> buildList {
                if (!placeholder) add(AuthStrategy.BEARER)
                add(AuthStrategy.NONE)
            }
            "apikey" -> buildList {
                if (!placeholder) add(AuthStrategy.API_KEY)
                add(AuthStrategy.NONE)
            }
            else -> buildList {
                add(AuthStrategy.NONE)
                if (!placeholder) {
                    add(AuthStrategy.API_KEY)
                    add(AuthStrategy.BEARER)
                }
            }
        }
    }

    private fun applyAuth(builder: Request.Builder, token: String, strategy: AuthStrategy) {
        if (strategy == AuthStrategy.NONE) return
        val t = token.trim()
        if (t.isEmpty() || AppConfig.isPlaceholderToken(t)) return
        val bearer = if (t.startsWith("Bearer ", true)) t.substring(7).trim() else t
        when (strategy) {
            AuthStrategy.BEARER -> {
                builder.header("Authorization", "Bearer $bearer")
                builder.header("apikey", bearer)
            }
            AuthStrategy.API_KEY -> builder.header("apikey", bearer)
            AuthStrategy.NONE -> Unit
        }
    }

    private fun truncate(value: String, max: Int): String =
        if (value.length <= max) value else value.substring(0, max) + "..."
}
