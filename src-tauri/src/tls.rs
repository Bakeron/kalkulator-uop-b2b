//! TLS on Android: rustls with the ring provider and Mozilla's list of root certificates
//! (webpki-roots). On the PC the system's own TLS is used (native-tls - Schannel on Windows).

use std::sync::Arc;

use rustls::{ClientConfig, RootCertStore};

/// For the HTTP client (reqwest) - HTTP/2 and HTTP/1.1.
pub fn http_config() -> Result<ClientConfig, String> {
    let roots = RootCertStore { roots: webpki_roots::TLS_SERVER_ROOTS.to_vec() };
    let mut config = ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .map(|b| b.with_root_certificates(roots).with_no_client_auth())
        .map_err(|e| format!("TLS setup: {e}"))?;
    config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
    Ok(config)
}
