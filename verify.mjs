import { verifyMessage } from "viem";

// Ulvane's published signing address (see https://www.ulvane.xyz/docs#verifiable-responses).
// Pinned so a response signed by SOME key isn't mistaken for one signed by Ulvane.
// Override with ULVANE_SIGNER_ADDRESS if the key is ever rotated.
export const ULVANE_SIGNER = "0xdCac2E5680797cd6d7483764A76278cE5f91ECe8";

/**
 * Checks the EIP-191 signature on a paid Ulvane response: the signature must
 * be valid for the body (minus signature/signerAddress) AND come from the
 * pinned Ulvane signer. Never throws.
 */
export async function verifyUlvaneResponse(body, trustedSigner = process.env.ULVANE_SIGNER_ADDRESS ?? ULVANE_SIGNER) {
  if (!body || typeof body !== "object") return { signatureValid: false, trustedSigner: false, reason: "response is not a JSON object" };
  const { signature, signerAddress, ...data } = body;
  if (!signature || !signerAddress) return { signatureValid: false, trustedSigner: false, reason: "response is unsigned" };
  let valid = false;
  try {
    valid = await verifyMessage({ address: signerAddress, message: JSON.stringify(data), signature });
  } catch {
    valid = false;
  }
  const trusted = valid && String(signerAddress).toLowerCase() === String(trustedSigner).toLowerCase();
  return {
    signatureValid: valid,
    trustedSigner: trusted,
    signer: signerAddress,
    ...(valid && !trusted ? { reason: "signature is valid but not from Ulvane's published signer" } : {}),
    ...(!valid ? { reason: "signature does not match the response body" } : {}),
  };
}
