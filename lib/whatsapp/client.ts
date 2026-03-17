import type {
  MetaCreateTemplatePayload,
  MetaTemplateResponse,
  MetaSendMessagePayload,
  MetaSendMessageResponse,
} from "./types";

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export class WhatsAppClient {
  private accessToken: string;
  private wabaId: string;
  private phoneNumberId: string;

  constructor(config: {
    accessToken: string;
    wabaId: string;
    phoneNumberId: string;
  }) {
    this.accessToken = config.accessToken;
    this.wabaId = config.wabaId;
    this.phoneNumberId = config.phoneNumberId;
  }

  private async request<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      const errorMessage =
        data?.error?.message || data?.error?.error_user_msg || "Meta API error";
      const errorCode = data?.error?.code || res.status;
      throw new WhatsAppApiError(errorMessage, errorCode, data);
    }

    return data as T;
  }

  // ── Template Management ─────────────────────────────────────────────────

  async createTemplate(
    payload: MetaCreateTemplatePayload
  ): Promise<MetaTemplateResponse> {
    return this.request<MetaTemplateResponse>(
      `${META_BASE_URL}/${this.wabaId}/message_templates`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  async getTemplates(): Promise<{ data: MetaTemplateResponse[] }> {
    return this.request<{ data: MetaTemplateResponse[] }>(
      `${META_BASE_URL}/${this.wabaId}/message_templates?limit=100`
    );
  }

  async getTemplate(
    templateName: string
  ): Promise<{ data: MetaTemplateResponse[] }> {
    return this.request<{ data: MetaTemplateResponse[] }>(
      `${META_BASE_URL}/${this.wabaId}/message_templates?name=${encodeURIComponent(templateName)}`
    );
  }

  async deleteTemplate(templateName: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(
      `${META_BASE_URL}/${this.wabaId}/message_templates?name=${encodeURIComponent(templateName)}`,
      { method: "DELETE" }
    );
  }

  // ── Sending Messages ──────────────────────────────────────────────────

  async sendTemplateMessage(
    payload: MetaSendMessagePayload
  ): Promise<MetaSendMessageResponse> {
    return this.request<MetaSendMessageResponse>(
      `${META_BASE_URL}/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  // ── Utility ───────────────────────────────────────────────────────────

  async verifyConnection(): Promise<{
    verified: boolean;
    phoneNumber?: string;
    qualityRating?: string;
  }> {
    try {
      const data = await this.request<{
        verified_name: string;
        display_phone_number: string;
        quality_rating: string;
      }>(`${META_BASE_URL}/${this.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`);

      return {
        verified: true,
        phoneNumber: data.display_phone_number,
        qualityRating: data.quality_rating,
      };
    } catch {
      return { verified: false };
    }
  }
}

// ── Error Class ───────────────────────────────────────────────────────────

export class WhatsAppApiError extends Error {
  code: number;
  details: unknown;

  constructor(message: string, code: number, details?: unknown) {
    super(message);
    this.name = "WhatsAppApiError";
    this.code = code;
    this.details = details;
  }
}
