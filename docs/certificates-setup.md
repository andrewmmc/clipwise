# Apple Code Signing Certificates Guide

## Overview

Clipwise uses two different distribution methods, each requiring different certificates:

1. **Direct Distribution (DMG)** - Requires Developer ID certificates
2. **App Store Distribution** - Requires Apple Distribution certificates

## Certificates Needed

### 1. For Direct Distribution (GitHub Release / DMG)

- **Developer ID Application Certificate**
  - Purpose: Signs the .app bundle for direct distribution
  - Identity: `Developer ID Application: Your Name (TEAM_ID)`
  - GitHub Secret: `DEVELOPER_ID_CERTIFICATE`
  - Used in: `.github/workflows/release.yml`

### 2. For App Store Upload

- **Apple Distribution Certificate**
  - Purpose: Signs the .app bundle for App Store submission
  - Identity: `Apple Distribution: Your Name (TEAM_ID)`
  - GitHub Secret: `APPLE_CERTIFICATE`
  - Used in: `.github/workflows/appstore.yml`

- **3rd Party Mac Developer Installer Certificate**
  - Purpose: Signs the .pkg installer for App Store
  - Identity: `3rd Party Mac Developer Installer: Your Name (TEAM_ID)`
  - GitHub Secret: `MAC_INSTALLER_CERTIFICATE`
  - Used in: `.github/workflows/appstore.yml`

## How to Create/Download Certificates

### Step 1: Go to Apple Developer Portal

Visit https://developer.apple.com/account/resources/certificates/list

### Step 2: Create Apple Distribution Certificate

1. Click "+" button
2. Select "Apple Distribution" (under "Software" section)
3. Follow instructions to create a CSR (Certificate Signing Request) using Keychain Access:
   - Open Keychain Access
   - Certificate Assistant → Request a Certificate from a Certificate Authority
   - Enter your email address
   - Choose "Saved to disk"
   - Save as `CertificateSigningRequest.certSigningRequest`
4. Upload the CSR to Apple Developer portal
5. Download the resulting certificate
6. Double-click to install in your Keychain

### Step 3: Create 3rd Party Mac Developer Installer Certificate

1. Click "+" button
2. Select "Mac Installer Distribution" (under "Software" section)
3. Create and upload another CSR (same process as above)
4. Download and install the certificate

### Step 4: Export Certificates as .p12 Files

For each certificate in Keychain Access:

1. Open Keychain Access → "My Certificates" category
2. Find the certificate (e.g., "Apple Distribution: Your Name")
3. Right-click → Export
4. Choose file format: **Personal Information Exchange (.p12)**
5. Save with a memorable password
6. Repeat for all three certificates

### Step 5: Base64 Encode and Add to GitHub Secrets

For each .p12 file, run:

```bash
base64 -i certificate.p12 | pbcopy
```

Then add to GitHub repository secrets:

| GitHub Secret                        | Certificate                       | Workflow     |
| ------------------------------------ | --------------------------------- | ------------ |
| `DEVELOPER_ID_CERTIFICATE`           | Developer ID Application          | release.yml  |
| `DEVELOPER_ID_CERTIFICATE_PASSWORD`  | Password for above                | release.yml  |
| `APPLE_CERTIFICATE`                  | Apple Distribution                | appstore.yml |
| `APPLE_CERTIFICATE_PASSWORD`         | Password for above                | appstore.yml |
| `MAC_INSTALLER_CERTIFICATE`          | 3rd Party Mac Developer Installer | appstore.yml |
| `MAC_INSTALLER_CERTIFICATE_PASSWORD` | Password for above                | appstore.yml |

## Verify Certificate Identities

To check your certificate identities after importing:

```bash
# List all code signing certificates
security find-identity -v -p codesigning

# Look for identities matching these patterns:
# - "Apple Distribution: Your Name (TEAM_ID)"
# - "Developer ID Application: Your Name (TEAM_ID)"
# - "3rd Party Mac Developer Installer: Your Name (TEAM_ID)"
```

## Common Issues

### Error: "App Store builds require an Apple Distribution certificate"

**Problem**: The `APPLE_CERTIFICATE` secret contains a Developer ID certificate instead of Apple Distribution.

**Solution**: Create a new Apple Distribution certificate and update the `APPLE_CERTIFICATE` secret.

### Error: "Installer identity not found in keychain"

**Problem**: The `MAC_INSTALLER_CERTIFICATE` is missing or incorrect.

**Solution**: Ensure you have a "3rd Party Mac Developer Installer" certificate (not "Developer ID Installer").

## Related GitHub Variables

These should be set in your repository's Variables (not Secrets):

- `APPLE_SIGNING_IDENTITY`: `Apple Distribution: Your Name (XKK7J9PRAG)`
- `DEVELOPER_ID_SIGNING_IDENTITY`: `Developer ID Application: Your Name (XKK7J9PRAG)`
- `MAC_INSTALLER_IDENTITY`: `3rd Party Mac Developer Installer: Your Name (XKK7J9PRAG)`
- `APPLE_TEAM_ID`: Your team ID (e.g., `XKK7J9PRAG`)
- `APPLE_API_KEY`: Your App Store Connect API key ID
- `APPLE_API_ISSUER`: Your App Store Connect API issuer ID
