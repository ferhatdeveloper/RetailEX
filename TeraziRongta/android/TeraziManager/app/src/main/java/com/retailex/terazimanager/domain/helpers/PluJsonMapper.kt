package com.retailex.terazimanager.domain.helpers

import com.retailex.terazimanager.domain.models.ScalePluDefaults
import com.retailex.terazimanager.domain.models.ScalePluRecord
import com.retailex.terazimanager.domain.models.ScaleProductDto
import org.json.JSONObject

object PluJsonMapper {
    fun mapProductToPluJson(
        product: ScaleProductDto,
        rank: Int,
        lfCodeBase: Int,
        labelId: Int = 64,
        defaults: ScalePluDefaults = ScalePluDefaults(),
    ): JSONObject {
        var name = product.name.trim()
        if (name.length > 36) name = name.substring(0, 36)

        val lfCode = if (product.lfCode > 0) product.lfCode else resolveLfCode(product, rank, lfCodeBase)
        var code = (product.barcode ?: product.pluCode ?: lfCode.toString()).trim()
        if (code.length > 10) code = code.substring(code.length - 10)

        val barcodeType = if (product.barcodeType > 0) product.barcodeType else defaults.barcodeType
        val department = if (product.department > 0) product.department else defaults.department

        return JSONObject().apply {
            put("PluName", name)
            put("LFCode", lfCode)
            put("Code", code)
            put("BarCode", barcodeType)
            put("UnitPrice", ScalePriceHelper.toUnitPrice(product.price))
            put("WeightUnit", mapWeightUnit(product.unit))
            put("Deptment", department)
            put("Tare", 0)
            put("ShlefTime", clampShelfDays(product.shelfLifeDays))
            put("PackageType", 0)
            put("PackageWeight", 0)
            put("Tolerance", 0)
            put("Message1", 0)
            put("Message2", 0)
            put("LabelId", if (labelId > 0) labelId else 64)
            put("Reserved2", 0)
            put("Rebate", 0)
            put("Account", 0)
            put("QtyUnit", 0)
        }
    }

    fun toRecord(json: JSONObject, order: Int = 0): ScalePluRecord = ScalePluRecord(
        pluOrder = order,
        pluName = json.optString("PluName", ""),
        lfCode = json.optInt("LFCode", 0),
        code = json.optString("Code", ""),
        barcodeType = json.optInt("BarCode", 99),
        unitPrice = ScalePriceHelper.parsePriceText(json.opt("UnitPrice")?.toString()),
        weightUnit = json.optInt("WeightUnit", 4),
        department = json.optInt("Deptment", 21),
        shelfDays = json.optInt("ShlefTime", 15),
        labelId = json.optInt("LabelId", 64),
    )

    fun recordToJson(record: ScalePluRecord): JSONObject = JSONObject().apply {
        put("PluName", record.pluName)
        put("LFCode", record.lfCode)
        put("Code", record.code)
        put("BarCode", record.barcodeType)
        put("UnitPrice", record.unitPrice)
        put("WeightUnit", record.weightUnit)
        put("Deptment", record.department)
        put("ShlefTime", record.shelfDays)
        put("LabelId", record.labelId)
        put("Tare", 0)
        put("PackageType", 0)
        put("PackageWeight", 0)
        put("Tolerance", 0)
        put("Message1", 0)
        put("Message2", 0)
        put("Reserved2", 0)
        put("Rebate", 0)
        put("Account", 0)
        put("QtyUnit", 0)
    }

    fun getPluBarcode(json: JSONObject): String = json.optString("Code", "").trim()

    /** Rongta ShlefTime 0-365; 0/eksik ise varsayilan 15 gun. */
    fun clampShelfDays(days: Int): Int = when {
        days <= 0 -> 15
        days > 365 -> 365
        else -> days
    }

    fun mapWeightUnit(unit: String?): Int {
        if (unit.isNullOrEmpty()) return 4
        return when (unit.trim().uppercase()) {
            "KG", "LT", "L" -> 4
            "G", "GR" -> 1
            "10G" -> 2
            "100G" -> 3
            "50G" -> 0
            "OZ" -> 5
            "LB" -> 6
            "500G" -> 7
            "600G" -> 8
            else -> 4
        }
    }

    private fun resolveLfCode(product: ScaleProductDto, rank: Int, @Suppress("UNUSED_PARAMETER") lfCodeBase: Int): Int {
        product.pluCode?.let { plu ->
            val digits = plu.filter { it.isDigit() }
            if (digits.isNotEmpty() && digits.length <= 6) {
                digits.toIntOrNull()?.takeIf { it > 0 }?.let { return it }
            }
        }
        return rank
    }
}
