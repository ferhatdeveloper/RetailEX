/**
 * Geliştirme imzası — üretimde e-imza / mali mühür (HSM veya backend) bağlanmalı.
 */

export interface XmlSigner {
  sign(xml: string): Promise<string>;
}

export class DevelopmentXmlSigner implements XmlSigner {
  async sign(xml: string): Promise<string> {
    const signature = `
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
      <ds:SignedInfo>
        <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
        <ds:Reference URI="">
          <ds:Transforms>
            <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
          </ds:Transforms>
          <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
          <ds:DigestValue>DEV_MOCK_DIGEST</ds:DigestValue>
        </ds:Reference>
      </ds:SignedInfo>
      <ds:SignatureValue>DEV_MOCK_SIGNATURE</ds:SignatureValue>
      <ds:KeyInfo>
        <ds:X509Data>
          <ds:X509Certificate>DEV_PLACEHOLDER_CERT</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </ds:Signature>`;

    const closingTag = xml.lastIndexOf('</Invoice>');
    if (closingTag === -1) return xml + signature;
    return xml.slice(0, closingTag) + signature + xml.slice(closingTag);
  }
}

export const developmentXmlSigner = new DevelopmentXmlSigner();
