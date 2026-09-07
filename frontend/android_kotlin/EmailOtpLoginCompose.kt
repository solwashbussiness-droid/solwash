package com.solwash.app.ui

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

// Mandatory Email OTP Login in Jetpack Compose
@Composable
fun EmailOtpLoginScreen(
    onLoginSuccess: (token: String, userName: String) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var email by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var otpCode by remember { mutableStateOf("") }
    var isOtpSent by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val navyDark = Color(0xFF111D38)
    val goldenAccent = Color(0xFFF5A623)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // App Logo
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = navyDark),
            modifier = Modifier.size(72.dp)
        ) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("SOL", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 24.sp)
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        Text(
            text = "Welcome to Solar Care",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF0F172A)
        )

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = if (!isOtpSent) 
                "Enter your email to receive a secure OTP" 
            else 
                "Enter the 4-digit code sent to $email",
            fontSize = 14.sp,
            color = Color(0xFF64748B),
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(28.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                errorMessage?.let { msg ->
                    Text(text = msg, color = Color(0xFFEF4444), fontSize = 13.sp)
                    Spacer(modifier = Modifier.height(10.dp))
                }

                if (!isOtpSent) {
                    // STEP 1: Enter Email
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it; errorMessage = null },
                        label = { Text("Email Address") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    Button(
                        onClick = {
                            if (!email.contains("@")) {
                                errorMessage = "Please enter a valid email."
                                return@Button
                            }
                            isLoading = true
                            coroutineScope.launch(Dispatchers.IO) {
                                try {
                                    val url = URL("http://10.0.2.2:5000/api/auth/send-otp")
                                    val conn = (url.openConnection() as HttpURLConnection).apply {
                                        requestMethod = "POST"
                                        setRequestProperty("Content-Type", "application/json")
                                        doOutput = true
                                    }
                                    OutputStreamWriter(conn.outputStream).use {
                                        it.write(JSONObject().put("email", email.trim()).toString())
                                    }
                                    val resText = conn.inputStream.bufferedReader().use { it.readText() }
                                    val json = JSONObject(resText)
                                    withContext(Dispatchers.Main) {
                                        isLoading = false
                                        if (json.optBoolean("success")) {
                                            isOtpSent = true
                                            val devOtp = json.optString("otp")
                                            if (devOtp.isNotEmpty()) {
                                                otpCode = devOtp
                                                Toast.makeText(context, "OTP: $devOtp", Toast.LENGTH_LONG).show()
                                            }
                                        } else {
                                            errorMessage = json.optString("message", "Failed to send OTP.")
                                        }
                                    }
                                } catch (e: Exception) {
                                    withContext(Dispatchers.Main) {
                                        isLoading = false
                                        errorMessage = "Error: ${e.localizedMessage}"
                                    }
                                }
                            }
                        },
                        enabled = !isLoading,
                        colors = ButtonDefaults.buttonColors(containerColor = navyDark),
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(if (isLoading) "Sending..." else "Send OTP Code", fontWeight = FontWeight.Bold)
                    }
                } else {
                    // STEP 2: Enter Name & OTP
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Your Name (Optional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    OutlinedTextField(
                        value = otpCode,
                        onValueChange = { if (it.length <= 4) otpCode = it; errorMessage = null },
                        label = { Text("4-Digit OTP Code") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    Button(
                        onClick = {
                            if (otpCode.length < 4) {
                                errorMessage = "Please enter 4-digit OTP code."
                                return@Button
                            }
                            isLoading = true
                            coroutineScope.launch(Dispatchers.IO) {
                                try {
                                    val url = URL("http://10.0.2.2:5000/api/auth/verify-otp")
                                    val conn = (url.openConnection() as HttpURLConnection).apply {
                                        requestMethod = "POST"
                                        setRequestProperty("Content-Type", "application/json")
                                        doOutput = true
                                    }
                                    val payload = JSONObject().apply {
                                        put("email", email.trim())
                                        put("otp", otpCode.trim())
                                        if (name.isNotBlank()) put("name", name.trim())
                                    }
                                    OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
                                    val resText = conn.inputStream.bufferedReader().use { it.readText() }
                                    val json = JSONObject(resText)
                                    withContext(Dispatchers.Main) {
                                        isLoading = false
                                        if (json.optBoolean("success")) {
                                            val data = json.getJSONObject("data")
                                            val token = data.getString("token")
                                            val uName = data.getJSONObject("user").getString("name")
                                            onLoginSuccess(token, uName)
                                        } else {
                                            errorMessage = json.optString("message", "Invalid OTP.")
                                        }
                                    }
                                } catch (e: Exception) {
                                    withContext(Dispatchers.Main) {
                                        isLoading = false
                                        errorMessage = "Error: ${e.localizedMessage}"
                                    }
                                }
                            }
                        },
                        enabled = !isLoading,
                        colors = ButtonDefaults.buttonColors(containerColor = goldenAccent),
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(if (isLoading) "Verifying..." else "Verify & Enter App", color = Color(0xFF0F172A), fontWeight = FontWeight.Bold)
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    TextButton(
                        onClick = { isOtpSent = false; otpCode = "" },
                        modifier = Modifier.align(Alignment.CenterHorizontally)
                    ) {
                        Text("Change Email Address", color = navyDark, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}
