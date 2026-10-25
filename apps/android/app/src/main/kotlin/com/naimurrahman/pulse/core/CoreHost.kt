package com.naimurrahman.pulse.core

import com.naimurrahman.pulse.core.ffi.PulseCore
import com.naimurrahman.pulse.core.ffi.coreVersion
import com.naimurrahman.pulse.core.ffi.localDay as ffiLocalDay

/**
 * The only door to the Rust core (docs/ARCHITECTURE.md section 3): wraps the generated UniFFI
 * bindings so nothing else in the app imports them. Business logic stays in Rust.
 */
class CoreHost private constructor(private val core: PulseCore) : AutoCloseable {
    val version: String get() = coreVersion()

    /** The local day (`YYYY-MM-DD`) of an instant in an IANA zone, from the core's time math. */
    fun localDay(epochSeconds: Long, zone: String): String = ffiLocalDay(epochSeconds, zone)

    /** The device clock in whole epoch seconds, read through the core's `Clock` port. */
    fun nowEpochSeconds(): Long = core.nowEpochSeconds()

    override fun close() = core.close()

    companion object {
        fun start(): CoreHost = CoreHost(PulseCore())
    }
}

/**
 * The process-wide running core. The foreground service starts it and stops it; screens read
 * [current] and show "not running" when it is null.
 */
object CoreRuntime {
    private var host: CoreHost? = null

    @Synchronized
    fun start(): CoreHost = host ?: CoreHost.start().also { host = it }

    @Synchronized
    fun current(): CoreHost? = host

    @Synchronized
    fun stop() {
        host?.close()
        host = null
    }
}
