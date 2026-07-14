import "server-only";

import { createHash } from "crypto";
import type { Json } from "@/lib/supabase/types";
import type { SlipVerificationStatus } from "@/lib/lucky-draw/types";

type Slip2GoReceiver = {
  accountType: string;
  accountNumber?: string;
  accountNameTH?: string;
  accountNameEN?: string;
};

type PromptPayKind = "phone" | "national_id" | "ewallet";

type PromptPayAccount = {
  kind: PromptPayKind;
  accountNumber: string;
};

export type Slip2GoPaymentContext = {
  amountThb: number;
  promptPayId?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
};

export type Slip2GoVerificationResult = {
  status: SlipVerificationStatus;
  autoApprove: boolean;
  providerCode: string | null;
  providerMessage: string | null;
  providerResponse: Json;
  referenceId: string | null;
  decodedQrHash: string | null;
};

const slip2GoValidCode = "200200";
const defaultSlip2GoApiUrl = "https://connect.slip2go.com";
// Hard allowlist for the Slip2Go endpoint. A misconfigured SLIP2GO_API_URL
// otherwise leaks the bearer secret + payment slip image to whatever host an
// operator typo'd. Extend this list only when Slip2Go publishes a new host.
const allowedSlip2GoHosts = new Set<string>([
  "connect.slip2go.com",
]);
const verificationWindowMs = 24 * 60 * 60 * 1000;
const defaultPromptPayAccountTypes: Record<PromptPayKind, string> = {
  phone: "02001",
  national_id: "02002",
  ewallet: "02003",
};
const thaiBankAccountTypes = [
  { accountType: "01002", aliases: ["bangkok bank", "bbl", "ธนาคารกรุงเทพ", "กรุงเทพ"] },
  { accountType: "01004", aliases: ["kasikornbank", "kasikorn", "kbank", "ธนาคารกสิกรไทย", "กสิกร"] },
  { accountType: "01006", aliases: ["krungthai", "krung thai", "ktb", "ธนาคารกรุงไทย", "กรุงไทย"] },
  { accountType: "01011", aliases: ["tmbthanachart", "tmb thanachart", "ttb", "tmb", "ธนาคารทหารไทยธนชาต", "ทหารไทยธนชาต"] },
  { accountType: "01014", aliases: ["siam commercial", "scb", "ธนาคารไทยพาณิชย์", "ไทยพาณิชย์"] },
  { accountType: "01017", aliases: ["citibank", "citi", "ซิตี้แบงก์"] },
  { accountType: "01020", aliases: ["standard chartered", "scbt", "สแตนดาร์ดชาร์เตอร์ด"] },
  { accountType: "01022", aliases: ["cimb", "cimb thai", "ซีไอเอ็มบี"] },
  { accountType: "01024", aliases: ["united overseas bank", "uob", "ยูโอบี"] },
  { accountType: "01025", aliases: ["bank of ayudhya", "krungsri", "bay", "ธนาคารกรุงศรีอยุธยา", "กรุงศรี"] },
  { accountType: "01030", aliases: ["government savings bank", "gsb", "ธนาคารออมสิน", "ออมสิน"] },
  { accountType: "01031", aliases: ["hsbc", "ฮ่องกงและเซี่ยงไฮ้"] },
  { accountType: "01033", aliases: ["government housing bank", "ghb", "gh bank", "ธนาคารอาคารสงเคราะห์", "ธอส"] },
  { accountType: "01034", aliases: ["baac", "bank for agriculture", "ธนาคารเพื่อการเกษตร", "ธกส"] },
  { accountType: "01035", aliases: ["exim", "export import bank", "ธนาคารเพื่อการส่งออกและนำเข้า", "ส่งออกและนำเข้า"] },
  { accountType: "01039", aliases: ["mizuho", "มิซูโฮ"] },
  { accountType: "01045", aliases: ["bnp paribas", "บีเอ็นพี"] },
  { accountType: "01052", aliases: ["bank of china", "boc", "ธนาคารแห่งประเทศจีน"] },
  { accountType: "01065", aliases: ["thanachart", "thanachart bank", "ธนาคารธนชาต", "ธนชาต"] },
  { accountType: "01066", aliases: ["islamic bank", "isbt", "ธนาคารอิสลาม"] },
  { accountType: "01067", aliases: ["tisco", "ทิสโก้"] },
  { accountType: "01069", aliases: ["kiatnakin", "kiatnakin phatra", "kkp", "เกียรตินาคิน", "เกียรตินาคินภัทร"] },
  { accountType: "01070", aliases: ["icbc", "ไอซีบีซี"] },
  { accountType: "01071", aliases: ["thai credit", "ไทยเครดิต"] },
  { accountType: "01073", aliases: ["land and houses", "lh bank", "แลนด์ แอนด์ เฮ้าส์", "แลนด์แอนด์เฮ้าส์"] },
  { accountType: "01079", aliases: ["anz", "australia and new zealand"] },
  { accountType: "01080", aliases: ["sumitomo mitsui trust", "smtb", "ซูมิโตโม มิตซุย ทรัสต์"] },
  { accountType: "01098", aliases: ["sme development bank", "sme d bank", "sme bank", "ธนาคารพัฒนาวิสาหกิจ", "เอสเอ็มอี"] },
] as const;

export function sha256Hex(value: ArrayBuffer | string) {
  return createHash("sha256").update(typeof value === "string" ? value : Buffer.from(value)).digest("hex");
}

function normalizeBaseUrl(value: string | undefined) {
  const clean = value?.trim().replace(/\/+$/, "");
  if (!clean) return null;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== "https:") return null;
    if (!allowedSlip2GoHosts.has(parsed.hostname)) return null;
    return clean;
  } catch {
    return null;
  }
}

function normalizePaymentAccount(value: string | null | undefined) {
  return (value ?? "").replace(/\D+/g, "");
}

function normalizeBankAccount(value: string | null | undefined) {
  const digits = normalizePaymentAccount(value);
  if (digits.length < 6 || digits.length > 20 || /^0+$/.test(digits)) {
    return null;
  }
  return digits;
}

function normalizeLookup(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[\s._()[\]{}\-]+/g, "");
}

function isAccountType(value: string | null | undefined) {
  return Boolean(value && /^\d{5}$/.test(value));
}

function getStringEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

function getAccountTypeEnv(name: string) {
  const value = getStringEnv(name);
  return isAccountType(value) ? value : null;
}

function bankAccountTypeFromEnvMap(bankName: string | null | undefined) {
  const rawMap = getStringEnv("SLIP2GO_BANK_ACCOUNT_TYPES_JSON");
  const cleanBankName = normalizeLookup(bankName);
  if (!rawMap || !cleanBankName) return null;

  try {
    const map = JSON.parse(rawMap) as Record<string, unknown>;
    for (const [alias, accountType] of Object.entries(map)) {
      if (typeof accountType === "string" && isAccountType(accountType) && cleanBankName.includes(normalizeLookup(alias))) {
        return accountType;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function slip2GoBankAccountType(bankName: string | null | undefined) {
  const clean = normalizeLookup(bankName);
  if (!clean) return null;

  const envMappedType = bankAccountTypeFromEnvMap(bankName);
  if (envMappedType) return envMappedType;

  const matchedBank = thaiBankAccountTypes.find((bank) => bank.aliases.some((alias) => clean.includes(normalizeLookup(alias))));
  return matchedBank?.accountType ?? null;
}

function normalizePromptPayAccount(value: string | null | undefined): PromptPayAccount | null {
  const digits = normalizePaymentAccount(value);
  if (!digits || /^0+$/.test(digits)) return null;

  const phone = digits.length === 11 && digits.startsWith("66") ? `0${digits.slice(2)}` : digits;
  if (phone.length === 10 && phone.startsWith("0")) {
    return { kind: "phone", accountNumber: phone };
  }

  if (digits.length === 13) {
    return { kind: "national_id", accountNumber: digits };
  }

  if (digits.length === 15) {
    return { kind: "ewallet", accountNumber: digits };
  }

  return null;
}

function promptPayAccountType(kind: PromptPayKind) {
  if (kind === "phone") {
    return getAccountTypeEnv("SLIP2GO_PROMPTPAY_PHONE_ACCOUNT_TYPE")
      ?? getAccountTypeEnv("SLIP2GO_PROMPTPAY_ACCOUNT_TYPE")
      ?? defaultPromptPayAccountTypes.phone;
  }

  if (kind === "national_id") {
    return getAccountTypeEnv("SLIP2GO_PROMPTPAY_NATIONAL_ID_ACCOUNT_TYPE")
      ?? defaultPromptPayAccountTypes.national_id;
  }

  return getAccountTypeEnv("SLIP2GO_PROMPTPAY_EWALLET_ACCOUNT_TYPE")
    ?? defaultPromptPayAccountTypes.ewallet;
}

function receiverKey(receiver: Slip2GoReceiver) {
  return [
    receiver.accountType,
    receiver.accountNumber ?? "",
    receiver.accountNameTH ?? "",
    receiver.accountNameEN ?? "",
  ].join("|");
}

function getNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function buildReceiverChecks(
  context: Omit<Slip2GoPaymentContext, "amountThb">,
) {
  const receivers: Slip2GoReceiver[] = [];
  const promptPay = normalizePromptPayAccount(context.promptPayId);
  const bankAccountType = slip2GoBankAccountType(context.bankName) ?? getAccountTypeEnv("SLIP2GO_BANK_ACCOUNT_TYPE");
  const bankAccountNumber = normalizeBankAccount(context.bankAccountNumber);

  if (promptPay) {
    receivers.push({
      accountType: promptPayAccountType(promptPay.kind),
      accountNumber: promptPay.accountNumber,
    });
  }

  if (bankAccountType && bankAccountNumber) {
    const bankReceiver: Slip2GoReceiver = {
      accountType: bankAccountType,
      accountNumber: bankAccountNumber,
    };

    const accountName = context.bankAccountName?.trim();
    if (accountName) {
      if (/[ก-๙]/.test(accountName)) bankReceiver.accountNameTH = accountName;
      if (/[a-z]/i.test(accountName)) bankReceiver.accountNameEN = accountName;
    }

    receivers.push(bankReceiver);
  }

  return receivers.filter((receiver, index) => receivers.findIndex((candidate) => receiverKey(candidate) === receiverKey(receiver)) === index);
}

export function hasSlip2GoReceiverCheck(
  context: Omit<Slip2GoPaymentContext, "amountThb">,
) {
  const promptPayProvided = Boolean(context.promptPayId?.trim());
  const bankDestinationProvided = Boolean(
    context.bankName?.trim() || context.bankAccountNumber?.trim(),
  );
  const promptPayValid =
    !promptPayProvided || Boolean(normalizePromptPayAccount(context.promptPayId));
  const bankDestinationValid =
    !bankDestinationProvided ||
    Boolean(
      (slip2GoBankAccountType(context.bankName) ??
        getAccountTypeEnv("SLIP2GO_BANK_ACCOUNT_TYPE")) &&
        normalizeBankAccount(context.bankAccountNumber),
    );

  return Boolean(
    (promptPayProvided || bankDestinationProvided) &&
      promptPayValid &&
      bankDestinationValid &&
      buildReceiverChecks(context).length > 0,
  );
}

function getProviderString(response: unknown, key: string) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const value = (response as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getDataString(response: unknown, key: string) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const data = (response as Record<string, unknown>).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function providerStatus(code: string | null): SlipVerificationStatus {
  if (code === slip2GoValidCode) return "valid";
  if (code === "200401") return "receiver_mismatch";
  if (code === "200402") return "amount_mismatch";
  if (code === "200403") return "date_mismatch";
  if (code === "200404") return "not_found";
  if (code === "200500") return "fraud";
  if (code === "200501") return "duplicate";
  if (code?.startsWith("401")) return "provider_error";
  if (code?.startsWith("400")) return "manual_review";
  return "manual_review";
}

export function createSlip2GoProviderError(message: string): Slip2GoVerificationResult {
  return {
    status: "provider_error",
    autoApprove: false,
    providerCode: null,
    providerMessage: message,
    providerResponse: { error: message },
    referenceId: null,
    decodedQrHash: null,
  };
}

export async function verifySlipWithSlip2Go(file: File, context: Slip2GoPaymentContext): Promise<Slip2GoVerificationResult> {
  const apiUrl = normalizeBaseUrl(process.env.SLIP2GO_API_URL) ?? defaultSlip2GoApiUrl;
  const secretKey = process.env.SLIP2GO_SECRET_KEY?.trim();
  if (!secretKey) {
    return createSlip2GoProviderError("Slip2Go secret key is not configured.");
  }

  const receivers = buildReceiverChecks(context);
  if (!receivers.length) {
    return {
      status: "manual_review",
      autoApprove: false,
      providerCode: null,
      providerMessage: "Slip2Go receiver check is not configured.",
      providerResponse: { error: "missing_receiver_condition" },
      referenceId: null,
      decodedQrHash: null,
    };
  }

  const payload = {
    checkDuplicate: true,
    checkReceiver: receivers,
    checkAmount: {
      type: "eq",
      amount: String(context.amountThb),
    },
    checkDate: {
      type: "gte",
      date: new Date(Date.now() - verificationWindowMs).toISOString(),
    },
  };

  const form = new FormData();
  form.set("file", file, file.name);
  form.set("payload", JSON.stringify(payload));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getNumberEnv("SLIP2GO_TIMEOUT_MS", 12000));

  try {
    const response = await fetch(`${apiUrl}/api/verify-slip/qr-image/info`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secretKey}`,
      },
      body: form,
      signal: controller.signal,
    });

    const text = await response.text();
    let providerResponse: Json = {};
    try {
      providerResponse = text ? (JSON.parse(text) as Json) : {};
    } catch {
      return createSlip2GoProviderError(`Slip2Go returned a non-JSON response (${response.status}).`);
    }

    const providerCode = getProviderString(providerResponse, "code");
    const providerMessage = getProviderString(providerResponse, "message") ?? response.statusText;
    const referenceId = getDataString(providerResponse, "referenceId");
    const decode = getDataString(providerResponse, "decode");
    const status = response.ok ? providerStatus(providerCode) : "provider_error";

    return {
      status,
      autoApprove: status === "valid" && providerCode === slip2GoValidCode,
      providerCode,
      providerMessage,
      providerResponse,
      referenceId,
      decodedQrHash: decode ? sha256Hex(decode) : null,
    };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Slip2Go verification timed out."
      : "Slip2Go verification is unavailable.";
    return createSlip2GoProviderError(message);
  } finally {
    clearTimeout(timeout);
  }
}
