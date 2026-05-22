import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

interface CaptchaModalProps {
  siteKey: string;
  visible: boolean;
  onToken: (token: string) => void;
  onClose: () => void;
  onError?: (error: string) => void;
  action?: string;
  languageCode?: string;
}

export function CaptchaModal({
  siteKey,
  visible,
  onToken,
  onClose,
  onError,
  action = "verify",
  languageCode = "en",
}: CaptchaModalProps) {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <script src="https://www.google.com/recaptcha/api.js?render=${siteKey}&hl=${languageCode}"></script>
      <style>
        body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: transparent; }
      </style>
    </head>
    <body>
      <script>
        grecaptcha.ready(function() {
          grecaptcha.execute('${siteKey}', { action: '${action}' })
            .then(function(token) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'token', token: token }));
            })
            .catch(function(err) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: err.message || 'CAPTCHA failed' }));
            });
        });
      </script>
    </body>
    </html>
  `;

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === "token") {
          onToken(data.token);
        } else if (data.type === "error") {
          onError?.(data.message);
        }
      } catch {
        onError?.("Failed to parse CAPTCHA response");
      }
    },
    [onToken, onError]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Verifying...</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>
          {loading && (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#1A56DB" />
              <Text style={styles.loaderText}>Loading verification...</Text>
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ html }}
            style={[styles.webview, loading && { height: 0 }]}
            onLoadEnd={() => setLoading(false)}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={["*"]}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 400,
    minHeight: 200,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 16, fontWeight: "600", color: "#111827" },
  closeBtn: { padding: 4 },
  closeTxt: { fontSize: 18, color: "#6B7280" },
  loader: { alignItems: "center", padding: 32 },
  loaderText: { marginTop: 12, fontSize: 14, color: "#6B7280" },
  webview: { height: 200, backgroundColor: "transparent" },
});
