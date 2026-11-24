package pl.prywatne.kalkulatoruopb2b

import android.content.res.Configuration
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    paintBars(night)
    // Edge-to-edge (forced from Android 15): keep the page clear of the status bar, the navigation
    // bar, the camera cutout and the on-screen keyboard. The WebView is added to this container
    // later, so the padding goes on the container; the bars show the page's background colour.
    ViewCompat.setOnApplyWindowInsetsListener(findViewById<View>(android.R.id.content)) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
      WindowInsetsCompat.CONSUMED
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    // The app's own theme switch (light / dark / like the system) tells the bars which colours
    // to take. It only changes two colours - nothing else is reachable from the page.
    webView.addJavascriptInterface(Bars(), "AndroidBars")
  }

  /** The page's --bg colour behind the bars, with dark icons on light and light icons on dark. */
  private fun paintBars(dark: Boolean) {
    window.decorView.setBackgroundColor(if (dark) 0xFF181C1F.toInt() else 0xFFEEF0F1.toInt())
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = !dark
      isAppearanceLightNavigationBars = !dark
    }
  }

  private inner class Bars {
    @JavascriptInterface
    fun theme(dark: Boolean) {
      runOnUiThread { paintBars(dark) }
    }
  }
}
