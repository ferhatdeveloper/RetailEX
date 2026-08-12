package com.retailex.callerid

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.Uri

object AppPrefs {
    private const val DB_NAME = "callerid_bridge.db"
    private const val DB_VERSION = 3
    private const val TABLE_SETTINGS = "settings"
    private const val KEY_ENDPOINT = "endpoint"
    private const val KEY_TOKEN = "token"
    private const val KEY_DEVICE = "device"
    private const val KEY_PORT = "port"
    private const val KEY_BACKGROUND = "background_enabled"
    private const val TABLE_EVENTS = "event_log"

    data class EventRow(
        val eventType: String,
        val title: String,
        val detail: String,
        val ts: Long,
        val sent: Boolean,
    )

    private class DbHelper(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS $TABLE_SETTINGS (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    endpoint TEXT NOT NULL DEFAULT '',
                    token TEXT NOT NULL DEFAULT '',
                    device TEXT NOT NULL DEFAULT '',
                    port TEXT NOT NULL DEFAULT '3001',
                    background_enabled INTEGER NOT NULL DEFAULT 1
                )
                """.trimIndent()
            )
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS $TABLE_EVENTS (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    detail TEXT NOT NULL,
                    ts INTEGER NOT NULL,
                    sent INTEGER NOT NULL DEFAULT 0
                )
                """.trimIndent()
            )
            db.execSQL(
                "INSERT OR IGNORE INTO $TABLE_SETTINGS (id, endpoint, token, device, port, background_enabled) VALUES (1, '', '', '', '3001', 1)"
            )
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            if (oldVersion < 2) {
                db.execSQL("ALTER TABLE $TABLE_SETTINGS ADD COLUMN background_enabled INTEGER NOT NULL DEFAULT 1")
            }
            if (oldVersion < 3) {
                db.execSQL("ALTER TABLE $TABLE_SETTINGS ADD COLUMN port TEXT NOT NULL DEFAULT '3001'")
            }
        }
    }

    private fun readValue(context: Context, column: String): String {
        val helper = DbHelper(context)
        helper.readableDatabase.use { db ->
            db.rawQuery("SELECT $column FROM $TABLE_SETTINGS WHERE id = 1", null).use { c ->
                if (c.moveToFirst()) {
                    return c.getString(0)?.trim().orEmpty()
                }
            }
        }
        return ""
    }

    private fun normalizePort(raw: String): String {
        val p = raw.trim()
        if (p.isBlank()) return "3001"
        val n = p.toIntOrNull() ?: return "3001"
        if (n !in 1..65535) return "3001"
        return n.toString()
    }

    private fun normalizeEndpoint(raw: String, portRaw: String): String {
        var s = raw.trim()
        if (s.isBlank()) return ""
        if (!s.startsWith("http://", ignoreCase = true) && !s.startsWith("https://", ignoreCase = true)) {
            s = "http://$s"
        }
        s = s.trimEnd('/')
        val pushPath = "/api/caller_id/push"
        val statusPath = "/api/status"
        val parsed = Uri.parse(s)
        val host = parsed.host.orEmpty()
        if (host.isNotBlank() && parsed.port == -1) {
            val scheme = parsed.scheme ?: "http"
            val path = parsed.path.orEmpty()
            val port = normalizePort(portRaw)
            s = "$scheme://$host:$port$path"
            s = s.trimEnd('/')
        }
        if (s.contains(pushPath) || s.contains(statusPath)) {
            return s.replace(statusPath, pushPath)
        }
        return "$s$pushPath"
    }

    fun endpoint(context: Context): String {
        return normalizeEndpoint(readValue(context, KEY_ENDPOINT), readValue(context, KEY_PORT))
    }

    fun token(context: Context): String {
        return readValue(context, KEY_TOKEN)
    }

    fun deviceName(context: Context): String {
        val v = readValue(context, KEY_DEVICE)
        return if (v.isBlank()) android.os.Build.MODEL.orEmpty() else v
    }

    fun port(context: Context): String {
        return normalizePort(readValue(context, KEY_PORT))
    }

    fun save(context: Context, endpoint: String, token: String, deviceName: String, port: String) {
        val normalizedPort = normalizePort(port)
        val ep = normalizeEndpoint(endpoint, normalizedPort)
        val tk = token.trim()
        val dv = deviceName.trim()
        val helper = DbHelper(context)
        helper.writableDatabase.use { db ->
            db.execSQL(
                "INSERT OR REPLACE INTO $TABLE_SETTINGS (id, endpoint, token, device, port, background_enabled) VALUES (1, ?, ?, ?, ?, COALESCE((SELECT background_enabled FROM $TABLE_SETTINGS WHERE id = 1), 1))",
                arrayOf(ep, tk, dv, normalizedPort)
            )
        }
    }

    fun backgroundEnabled(context: Context): Boolean {
        val helper = DbHelper(context)
        return helper.readableDatabase.use { db ->
            db.rawQuery("SELECT $KEY_BACKGROUND FROM $TABLE_SETTINGS WHERE id = 1", null).use { c ->
                if (c.moveToFirst()) c.getInt(0) == 1 else true
            }
        }
    }

    fun setBackgroundEnabled(context: Context, enabled: Boolean) {
        val helper = DbHelper(context)
        helper.writableDatabase.use { db ->
            db.execSQL(
                "UPDATE $TABLE_SETTINGS SET $KEY_BACKGROUND = ? WHERE id = 1",
                arrayOf(if (enabled) 1 else 0)
            )
        }
    }

    fun addEvent(
        context: Context,
        eventType: String,
        title: String,
        detail: String,
        sent: Boolean,
    ) {
        val helper = DbHelper(context)
        helper.writableDatabase.use { db ->
            db.execSQL(
                "INSERT INTO $TABLE_EVENTS (event_type, title, detail, ts, sent) VALUES (?, ?, ?, ?, ?)",
                arrayOf(eventType, title.take(80), detail.take(220), System.currentTimeMillis(), if (sent) 1 else 0)
            )
            // Tabloyu sınırlı tut: en son 300 olay.
            db.execSQL(
                """
                DELETE FROM $TABLE_EVENTS
                WHERE id NOT IN (
                    SELECT id FROM $TABLE_EVENTS ORDER BY id DESC LIMIT 300
                )
                """.trimIndent()
            )
        }
    }

    fun recentEvents(context: Context, limit: Int = 30): List<EventRow> {
        val out = mutableListOf<EventRow>()
        val helper = DbHelper(context)
        helper.readableDatabase.use { db ->
            db.rawQuery(
                "SELECT event_type, title, detail, ts, sent FROM $TABLE_EVENTS ORDER BY id DESC LIMIT ?",
                arrayOf(limit.coerceIn(1, 100).toString())
            ).use { c ->
                while (c.moveToNext()) {
                    out.add(
                        EventRow(
                            eventType = c.getString(0).orEmpty(),
                            title = c.getString(1).orEmpty(),
                            detail = c.getString(2).orEmpty(),
                            ts = c.getLong(3),
                            sent = c.getInt(4) == 1,
                        )
                    )
                }
            }
        }
        return out
    }
}
