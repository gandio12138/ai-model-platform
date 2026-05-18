import { Injectable } from "@nestjs/common";
import crypto from "node:crypto";

@Injectable()
export class CryptoService {
  private readonly key = crypto
    .createHash("sha256")
    .update(process.env.ENCRYPTION_KEY ?? "local-dev-encryption-key-change-me")
    .digest();

  encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, "utf8"),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString("base64"),
      tag.toString("base64"),
      encrypted.toString("base64")
    ].join(".");
  }

  decryptSecret(value: string): string {
    const [ivText, tagText, encryptedText] = value.split(".");
    if (!ivText || !tagText || !encryptedText) {
      throw new Error("Invalid encrypted secret format");
    }
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(ivText, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  }
}
