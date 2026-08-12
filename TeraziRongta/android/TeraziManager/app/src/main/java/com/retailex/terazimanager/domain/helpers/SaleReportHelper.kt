package com.retailex.terazimanager.domain.helpers

import com.retailex.terazimanager.domain.models.SaleRecord
import java.text.SimpleDateFormat
import java.util.Locale

data class DailySaleSummary(
    val dateLabel: String,
    val totalWeight: Double,
    val totalAmount: Double,
    val lineCount: Int,
)

data class ProductSaleSummary(
    val pluName: String,
    val lfCode: Long,
    val totalWeight: Double,
    val totalAmount: Double,
    val lineCount: Int,
)

object SaleReportHelper {

    fun filterByDateRange(
        records: List<SaleRecord>,
        fromInclusive: String?,
        toInclusive: String?,
    ): List<SaleRecord> {
        if (fromInclusive.isNullOrBlank() && toInclusive.isNullOrBlank()) return records
        val from = fromInclusive?.let { parseDate(it)?.time }
        val to = toInclusive?.let { parseDate(it)?.time?.plus(86_399_999) }
        return records.filter { record ->
            val ts = record.saleDate?.let { parseDate(it)?.time } ?: return@filter false
            (from == null || ts >= from) && (to == null || ts <= to)
        }
    }

    fun aggregateByDay(records: List<SaleRecord>): List<DailySaleSummary> {
        return records
            .groupBy { record ->
                record.saleDate?.let { parseDate(it) }?.let { DAY_FORMAT.format(it) } ?: "Bilinmiyor"
            }
            .map { (day, items) ->
                DailySaleSummary(
                    dateLabel = day,
                    totalWeight = items.sumOf { it.weight },
                    totalAmount = items.sumOf { it.totalPrice },
                    lineCount = items.size,
                )
            }
            .sortedByDescending { it.dateLabel }
    }

    fun aggregateByProduct(records: List<SaleRecord>): List<ProductSaleSummary> {
        return records
            .groupBy { "${it.lfCode}:${it.pluName}" }
            .map { (_, items) ->
                val first = items.first()
                ProductSaleSummary(
                    pluName = first.pluName,
                    lfCode = first.lfCode,
                    totalWeight = items.sumOf { it.weight },
                    totalAmount = items.sumOf { it.totalPrice },
                    lineCount = items.size,
                )
            }
            .sortedByDescending { it.totalAmount }
    }

    fun knownDateCount(records: List<SaleRecord>): Int =
        records.count { !it.saleDate.isNullOrBlank() && parseDate(it.saleDate) != null }

    private fun parseDate(raw: String): java.util.Date? {
        val trimmed = raw.trim()
        for (pattern in DATE_PATTERNS) {
            runCatching {
                SimpleDateFormat(pattern, Locale.getDefault()).parse(trimmed)
            }.getOrNull()?.let { return it }
        }
        return null
    }

    private val DAY_FORMAT = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())

    private val DATE_PATTERNS = listOf(
        "yyyy-MM-dd HH:mm:ss",
        "yyyy/MM/dd HH:mm:ss",
        "dd.MM.yyyy HH:mm:ss",
        "dd/MM/yyyy HH:mm:ss",
        "yyyy-MM-dd",
        "dd.MM.yyyy",
    )
}
