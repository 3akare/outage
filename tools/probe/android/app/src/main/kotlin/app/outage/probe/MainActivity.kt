package app.outage.probe

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

/** Scaffold only. The debug screen arrives in feasibility-probe task 7. */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply { text = "Outage probe: scaffold only. No sensor yet." })
    }
}
