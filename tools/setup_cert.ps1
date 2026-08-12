$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=RetailEX" -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(10)
if ($cert) {
    Write-Host "THUMBPRINT_START"
    Write-Host $cert.Thumbprint
    Write-Host "THUMBPRINT_END"
} else {
    Write-Error "Failed to create certificate"
}
