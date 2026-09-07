package com.solwash.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.solwash.app.databinding.ActivityLoginBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    
    // Use 10.0.2.2 for Android Emulator to connect to host localhost:5000
    // Or use your actual local machine IP address for physical devices
    private val BASE_URL = "http://10.0.2.2:5000/api"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupListeners()
    }

    private fun setupListeners() {
        binding.btnLogin.setOnClickListener {
            val email = binding.etEmail.text.toString().trim()
            val password = binding.etPassword.text.toString().trim()

            if (validateInputs(email, password)) {
                performLogin(email, password)
            }
        }

        binding.tvForgotPassword.setOnClickListener {
            Toast.makeText(this, "Please contact SolWash support to reset password", Toast.LENGTH_SHORT).show()
        }

        binding.tvSignUp.setOnClickListener {
            Toast.makeText(this, "Redirecting to SolWash registration...", Toast.LENGTH_SHORT).show()
        }
    }

    private fun validateInputs(email: String, pass: String): Boolean {
        if (email.isEmpty()) {
            binding.tilEmail.error = "Email or Username is required"
            return false
        }
        binding.tilEmail.error = null

        if (pass.isEmpty()) {
            binding.tilPassword.error = "Password is required"
            return false
        }
        binding.tilPassword.error = null

        return true
    }

    private fun performLogin(emailOrUser: String, pass: String) {
        setLoadingState(true)

        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val url = URL("$BASE_URL/auth/login")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                    setRequestProperty("Accept", "application/json")
                    doOutput = true
                    doInput = true
                    connectTimeout = 8000
                    readTimeout = 8000
                }

                val payload = JSONObject().apply {
                    put("email", emailOrUser)
                    put("password", pass)
                }

                OutputStreamWriter(conn.outputStream).use { writer ->
                    writer.write(payload.toString())
                    writer.flush()
                }

                val responseCode = conn.responseCode
                val responseStream = if (responseCode in 200..299) conn.inputStream else conn.errorStream
                val responseString = responseStream.bufferedReader().use { it.readText() }
                val jsonResponse = JSONObject(responseString)

                withContext(Dispatchers.Main) {
                    setLoadingState(false)
                    if (responseCode in 200..299 && jsonResponse.optBoolean("success")) {
                        val token = jsonResponse.getJSONObject("data").getString("token")
                        val userName = jsonResponse.getJSONObject("data").getJSONObject("user").getString("name")

                        // Save token in SharedPreferences
                        val prefs = getSharedPreferences("SolWashPrefs", MODE_PRIVATE)
                        prefs.edit().putString("auth_token", token).apply()

                        Toast.makeText(this@LoginActivity, "Welcome, $userName!", Toast.LENGTH_LONG).show()
                        
                        // Proceed to Dashboard / Home activity
                        // startActivity(Intent(this@LoginActivity, MainActivity::class.java))
                        // finish()
                    } else {
                        val msg = jsonResponse.optString("message", "Login failed. Invalid credentials.")
                        Toast.makeText(this@LoginActivity, msg, Toast.LENGTH_LONG).show()
                    }
                }

            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    setLoadingState(false)
                    Toast.makeText(this@LoginActivity, "Connection error: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun setLoadingState(isLoading: Boolean) {
        binding.progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
        binding.btnLogin.isEnabled = !isLoading
        binding.btnLogin.text = if (isLoading) "" else "Sign In"
    }
}
