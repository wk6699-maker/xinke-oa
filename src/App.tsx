import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Edit3,
  Mail,
  Paperclip,
  TrendingUp,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
  Eye,
  EyeOff,
} from "lucide-react";

type Role = string;
type RegionLevel = "province" | "city" | "district";
type RegionCatalog = Record<string, Record<string, string[]>>;
type ClientGroup = { id: string; name: string };
type ClientSubgroup = { id: string; groupId: string; name: string };
type Client = {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  province?: string;
  city?: string;
  district?: string;
  customerTypeId?: string;
  /** Legacy fields retained while existing records are migrated. */
  groupId: string;
  subgroupId?: string;
};
type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
};
type PendingAttachment = {
  id: string;
  name: string;
  size: number;
  file: File;
  previewUrl: string;
  progress: number;
  status: "uploading" | "error";
  error?: string;
  uploadedId?: string;
};
type RecordItem = {
  id: string;
  docId: string;
  clientId: string;
  start: string;
  end: string;
  recordDate: string;
  fee: number;
  paid: number;
  paymentDate: string;
  method: string;
  feeType: string;
  employee?: string;
  projectName?: string;
  note: string;
  attachments?: Attachment[];
};
type PaymentItem = {
  id: string;
  docId: string;
  clientId: string;
  paymentDate: string;
  expectedPaymentDate?: string;
  method: string;
  amount: number;
  note: string;
  attachments?: Attachment[];
};
type CostItem = {
  id: string;
  docId: string;
  clientId: string;
  supplier?: string;
  reimburser?: string;
  costType?: string;
  feeTypes?: string[];
  amount: number;
  note: string;
  createdAt: string;
  attachments?: Attachment[];
};
type DailyExpense = {
  id: string;
  docId: string;
  recordDate: string;
  expenseType: string;
  reimburser: string;
  amount: number;
  note: string;
  attachments?: Attachment[];
};
type CustomerInfo = {
  id: string;
  clientId: string;
  name: string;
  note: string;
};
type EmailFrequency = "daily" | "weekly" | "monthly";
type EmailSchedule = {
  enabled: boolean;
  frequency: EmailFrequency;
  sendTime: string;
  weekDay?: number;
  monthDay?: number;
  recipients: string[];
  lastSentAt?: string;
  lastAutoSentAt?: string;
  lastTestAt?: string;
  lastError?: string;
};
type EmailServiceStatus = { configured: boolean; from: string | null };
type AuditAction = "create" | "update" | "delete" | "security" | "send";
type AuditLog = {
  id: string;
  userId: string;
  username: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  summary: string;
  createdAt: string;
};
type SupplierDetails = Record<string, { contact: string; phone: string }>;
type PermissionKey =
  | "dashboard"
  | "clients"
  | "clientGroups"
  | "clientProvince"
  | "clientCity"
  | "clientDistrict"
  | "clientCreate"
  | "clientEdit"
  | "clientDelete"
  | "fee"
  | "employees"
  | "feeTypes"
  | "feeCreate"
  | "feeEdit"
  | "feePayment"
  | "feeDelete"
  | "payment"
  | "paymentCreate"
  | "paymentEdit"
  | "paymentDelete"
  | "cost"
  | "costTypes"
  | "costReimbursers"
  | "costSuppliers"
  | "costCreate"
  | "costEdit"
  | "costDelete"
  | "info"
  | "infoCreate"
  | "infoEdit"
  | "infoDelete"
  | "companyExpenses"
  | "dailyExpenses"
  | "dailyExpenseTypes"
  | "dailyExpenseReimbursers"
  | "dailyExpenseCreate"
  | "dailyExpenseEdit"
  | "dailyExpenseDelete"
  | "users";
type PermissionGroup = {
  id: string;
  name: string;
  permissions: PermissionKey[];
};
type User = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  password?: string;
  mustChangePassword?: boolean;
  role: Role;
  status: "正常" | "停用";
  permissionGroupId?: string;
};

function normalizeAttachments(value: unknown): Attachment[] {
  let sourceValue = value;
  if (typeof sourceValue === "string") {
    try {
      const parsed = JSON.parse(sourceValue);
      sourceValue = parsed;
    } catch {
      sourceValue = [sourceValue];
    }
  }
  if (!Array.isArray(sourceValue)) return [];
  return sourceValue.flatMap((item, index) => {
    if (typeof item === "string") {
      const name = item.split("/").pop() || `附件${index + 1}`;
      const id = item.split("/").pop() || `legacy-attachment-${index}`;
      return [
        { id, name, mime: "", size: 0, url: normalizeAttachmentUrl(item, id) },
      ];
    }
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const rawId = String(source.id || source.filename || "").trim();
    const rawName = String(
      source.name || source.fileName || source.filename || "",
    ).trim();
    if (!rawId && !rawName) return [];
    const id = rawId || `legacy-attachment-${index}-${rawName}`;
    const name = rawName || id;
    const rawUrl = String(source.url || "").trim();
    const size = Number(source.size);
    return [
      {
        id,
        name,
        mime: String(source.mime || source.type || ""),
        size: Number.isFinite(size) ? size : 0,
        url: normalizeAttachmentUrl(rawUrl, id),
      },
    ];
  });
}

function normalizeAttachmentUrl(rawUrl: string, id: string) {
  if (rawUrl.startsWith("/uploads/")) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.startsWith("/uploads/"))
      return `${parsed.pathname}${parsed.search}`;
  } catch {
    // Invalid or legacy URLs fall back to the current site's upload route.
  }
  return `/uploads/${encodeURIComponent(id)}`;
}

const seedClients: Client[] = [
  {
    id: "c1",
    name: "张伟",
    company: "星河科技有限公司",
    phone: "138 0013 8001",
    email: "zhangwei@xinghe.com",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    createdAt: "2026-05-12",
    province: "内蒙古自治区",
    city: "鄂尔多斯市",
    district: "东胜区",
    customerTypeId: "g1",
    groupId: "g1",
    subgroupId: "sg1",
  },
  {
    id: "c2",
    name: "李娜",
    company: "远山设计工作室",
    phone: "139 2345 6789",
    email: "lina@yuan.design",
    startDate: "2026-06-01",
    endDate: "2026-12-31",
    createdAt: "2026-06-03",
    province: "内蒙古自治区",
    city: "鄂尔多斯市",
    district: "东胜区",
    customerTypeId: "g1",
    groupId: "g1",
    subgroupId: "sg1",
  },
  {
    id: "c3",
    name: "王浩",
    company: "森屿贸易",
    phone: "186 7654 3210",
    email: "wanghao@senyu.cn",
    startDate: "2026-07-01",
    endDate: "2026-12-31",
    createdAt: "2026-07-19",
    province: "内蒙古自治区",
    city: "鄂尔多斯市",
    district: "",
    customerTypeId: "g2",
    groupId: "g2",
    subgroupId: "sg2",
  },
];
const seedGroups: ClientGroup[] = [
  { id: "g1", name: "重点客户" },
  { id: "g2", name: "常规客户" },
];
const seedSubgroups: ClientSubgroup[] = [
  { id: "sg1", groupId: "g1", name: "默认分类" },
  { id: "sg2", groupId: "g2", name: "默认分类" },
];
const defaultProvince = "内蒙古自治区";
const defaultCity = "鄂尔多斯市";
const defaultDistrict = "";
const defaultRegionCatalog: RegionCatalog = {
  内蒙古自治区: {
    鄂尔多斯市: [
      "东胜区",
      "康巴什区",
      "达拉特旗",
      "杭锦旗",
      "乌审旗",
      "伊金霍洛旗",
      "鄂托克旗",
      "鄂托克前旗",
    ],
  },
  北京市: { 北京市: ["东城区", "西城区", "朝阳区", "海淀区"] },
  上海市: { 上海市: ["黄浦区", "徐汇区", "浦东新区"] },
  广东省: { 广州市: ["天河区", "越秀区"], 深圳市: ["南山区", "福田区"] },
};
const REGION_CATALOG_STORAGE_KEY = "yunqiao-ledger-regions-v1";
function readRegionCatalog(): RegionCatalog {
  if (typeof window === "undefined") return defaultRegionCatalog;
  try {
    const raw = window.localStorage.getItem(REGION_CATALOG_STORAGE_KEY);
    if (!raw) return defaultRegionCatalog;
    const parsed = JSON.parse(raw) as RegionCatalog;
    return parsed && typeof parsed === "object" ? parsed : defaultRegionCatalog;
  } catch {
    return defaultRegionCatalog;
  }
}
function migrateClientLocation(
  client: Client,
  groups: ClientGroup[],
  subgroups: ClientSubgroup[],
): Client {
  const customerTypeId =
    client.customerTypeId || client.groupId || groups[0]?.id || "";
  const subgroup = client.subgroupId
    ? subgroups.find((item) => item.id === client.subgroupId)
    : undefined;
  const legacyDistrict =
    subgroup &&
    !["直系客户", "李博合作客户", "默认分类"].includes(subgroup.name)
      ? subgroup.name
      : undefined;
  return {
    ...client,
    customerTypeId,
    groupId: client.groupId || customerTypeId,
    province: client.province || (legacyDistrict ? defaultProvince : ""),
    city: client.city || (legacyDistrict ? defaultCity : ""),
    district:
      client.district === "未设置区县"
        ? ""
        : client.district || legacyDistrict || "",
  };
}
const seedRecords: RecordItem[] = [
  {
    id: "r1",
    docId: "20260101001",
    clientId: "c1",
    start: "2026-01-01",
    end: "2026-12-31",
    recordDate: "2026-01-01",
    fee: 12000,
    paid: 6000,
    paymentDate: "2026-01-06",
    method: "银行转账",
    feeType: "维护费",
    note: "年度系统维护服务",
  },
  {
    id: "r2",
    docId: "20260701001",
    clientId: "c1",
    start: "2026-07-01",
    end: "2026-09-30",
    recordDate: "2026-07-01",
    fee: 2400,
    paid: 2400,
    paymentDate: "2026-07-02",
    method: "微信支付",
    feeType: "加速器",
    note: "第三季度增值服务",
  },
  {
    id: "r3",
    docId: "20260601001",
    clientId: "c2",
    start: "2026-06-01",
    end: "2026-12-31",
    recordDate: "2026-06-01",
    fee: 5600,
    paid: 2000,
    paymentDate: "2026-06-08",
    method: "支付宝",
    feeType: "X管家",
    note: "网站托管及维护",
  },
];
const seedFeeTypes = ["维护费", "加速器", "X管家"];
const seedCostTypes = ["硬件成本", "施工费用", "辅料费用", "差旅报销"];
const seedSuppliers = ["供应商一", "供应商二", "供应商三"];
const seedEmployees = ["乔鹏珍", "王进"];
const seedDailyExpenseTypes = ["办公用品", "差旅费用", "业务招待"];
const seedReimbursers = ["陈思远", "周敏", "刘洋"];
const seedEmailSchedule: EmailSchedule = {
  enabled: false,
  frequency: "daily",
  sendTime: "09:00",
  weekDay: 1,
  monthDay: 1,
  recipients: [],
};
const weekDayOptions = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" },
];
const monthDayOptions = Array.from({ length: 31 }, (_, index) => index + 1);
const seedUsers: User[] = [
  {
    id: "u1",
    name: "陈思远",
    username: "admin",
    email: "admin@yunqiao.cn",
    phone: "138 0000 0001",
    role: "管理员",
    status: "正常",
    permissionGroupId: "pg1",
  },
  {
    id: "u2",
    name: "周敏",
    username: "finance",
    email: "finance@yunqiao.cn",
    phone: "138 0000 0002",
    role: "财务",
    status: "正常",
    permissionGroupId: "pg2",
  },
  {
    id: "u3",
    name: "刘洋",
    username: "viewer",
    email: "viewer@yunqiao.cn",
    phone: "138 0000 0003",
    role: "查看者",
    status: "正常",
    permissionGroupId: "pg3",
  },
];
const allPermissions: { key: PermissionKey; label: string }[] = [
  { key: "dashboard", label: "业务总览" },
  { key: "clients", label: "客户列表" },
  { key: "clientGroups", label: "客户类型分类" },
  { key: "clientProvince", label: "省份/直辖市分类" },
  { key: "clientCity", label: "地市分类" },
  { key: "clientDistrict", label: "区/县分类" },
  { key: "clientCreate", label: "添加客户" },
  { key: "clientEdit", label: "修改客户" },
  { key: "clientDelete", label: "删除客户" },
  { key: "fee", label: "费用明细" },
  { key: "employees", label: "业务经理管理" },
  { key: "feeTypes", label: "费用明细类型" },
  { key: "feeCreate", label: "增加费用" },
  { key: "feeEdit", label: "修改记录" },
  { key: "feePayment", label: "添加回款" },
  { key: "feeDelete", label: "删除记录" },
  { key: "payment", label: "回款明细" },
  { key: "paymentCreate", label: "添加回款" },
  { key: "paymentEdit", label: "修改收款记录" },
  { key: "paymentDelete", label: "删除收款记录" },
  { key: "cost", label: "成本明细" },
  { key: "costTypes", label: "成本费用类型" },
  { key: "costReimbursers", label: "报销人" },
  { key: "costSuppliers", label: "供应商管理" },
  { key: "costCreate", label: "添加成本" },
  { key: "costEdit", label: "修改成本费用" },
  { key: "costDelete", label: "删除成本费用" },
  { key: "info", label: "运维资料" },
  { key: "infoCreate", label: "添加运维资料" },
  { key: "infoEdit", label: "修改资料" },
  { key: "infoDelete", label: "删除资料" },
  { key: "companyExpenses", label: "公司费用管理" },
  { key: "dailyExpenses", label: "日常费用管理" },
  { key: "dailyExpenseTypes", label: "费用类型" },
  { key: "dailyExpenseReimbursers", label: "报销人" },
  { key: "dailyExpenseCreate", label: "添加日常费用" },
  { key: "dailyExpenseEdit", label: "修改日常费用" },
  { key: "dailyExpenseDelete", label: "删除日常费用" },
  { key: "users", label: "权限管理" },
];
const clientManagementPermissions: PermissionKey[] = [
  "clientGroups",
  "clientProvince",
  "clientCity",
  "clientDistrict",
  "clientCreate",
  "clientEdit",
  "clientDelete",
];
const clientSubPermissions: PermissionKey[] = [...clientManagementPermissions];
const feeSubPermissions: PermissionKey[] = [
  "employees",
  "feeTypes",
  "feeCreate",
  "feeEdit",
  "feePayment",
  "feeDelete",
];
const feePermissions: PermissionKey[] = ["fee", ...feeSubPermissions];
const paymentSubPermissions: PermissionKey[] = [
  "paymentCreate",
  "paymentEdit",
  "paymentDelete",
];
const paymentPermissions: PermissionKey[] = [
  "payment",
  ...paymentSubPermissions,
];
const costSubPermissions: PermissionKey[] = [
  "costTypes",
  "costReimbursers",
  "costSuppliers",
  "costCreate",
  "costEdit",
  "costDelete",
];
const costPermissions: PermissionKey[] = ["cost", ...costSubPermissions];
const infoSubPermissions: PermissionKey[] = [
  "infoCreate",
  "infoEdit",
  "infoDelete",
];
const infoPermissions: PermissionKey[] = ["info", ...infoSubPermissions];
const companyExpenseSubPermissions: PermissionKey[] = ["dailyExpenses"];
const companyExpensePermissions: PermissionKey[] = [
  "companyExpenses",
  ...companyExpenseSubPermissions,
];
const dailyExpenseSubPermissions: PermissionKey[] = [
  "dailyExpenseTypes",
  "dailyExpenseReimbursers",
  "dailyExpenseCreate",
  "dailyExpenseEdit",
  "dailyExpenseDelete",
];
const dailyExpensePermissions: PermissionKey[] = [
  "dailyExpenses",
  ...dailyExpenseSubPermissions,
];
const seedPermissionGroups: PermissionGroup[] = [
  {
    id: "pg1",
    name: "管理员组",
    permissions: allPermissions.map((item) => item.key),
  },
  {
    id: "pg2",
    name: "财务组",
    permissions: [
      "dashboard",
      "clients",
      ...clientManagementPermissions,
      ...feePermissions,
      ...paymentPermissions,
      ...costPermissions,
      ...infoPermissions,
      ...companyExpensePermissions,
      ...dailyExpenseSubPermissions,
    ],
  },
  {
    id: "pg3",
    name: "查看组",
    permissions: [
      "dashboard",
      "clients",
      ...feePermissions,
      ...paymentPermissions,
      ...costPermissions,
      ...infoPermissions,
      ...companyExpensePermissions,
      ...dailyExpenseSubPermissions,
    ],
  },
];
function migratePermissionGroup(group: PermissionGroup): PermissionGroup {
  const permissions = new Set<PermissionKey>(group.permissions);
  // Region classification permissions did not exist in older saved roles.
  // Preserve access for roles that already had customer type management.
  const clientRegionPermissions: PermissionKey[] = [
    "clientProvince",
    "clientCity",
    "clientDistrict",
  ];
  if (
    permissions.has("clientGroups") &&
    !clientRegionPermissions.some((permission) => permissions.has(permission))
  )
    clientRegionPermissions.forEach((permission) =>
      permissions.add(permission),
    );
  [
    feePermissions,
    paymentPermissions,
    costPermissions,
    infoPermissions,
    dailyExpensePermissions,
  ].forEach((permissionSet) => {
    const [parent, ...children] = permissionSet;
    // A saved child permission always implies access to its parent section.
    if (children.some((permission) => permissions.has(permission)))
      permissions.add(parent);
    // Only expand legacy groups that have no granular permission saved yet.
    // Once any child exists, missing children represent intentional choices.
    if (
      permissions.has(parent) &&
      !children.some((permission) => permissions.has(permission))
    )
      children.forEach((permission) => permissions.add(permission));
  });
  // Company expenses were previously visible without a dedicated permission.
  // Existing roles with cost access retain that access until an administrator changes it.
  if (
    permissions.has("cost") &&
    !companyExpensePermissions.some((permission) => permissions.has(permission))
  )
    companyExpensePermissions.forEach((permission) =>
      permissions.add(permission),
    );
  if (
    permissions.has("cost") &&
    !permissions.has("costReimbursers") &&
    !permissions.has("costSuppliers")
  ) {
    permissions.add("costReimbursers");
    permissions.add("costSuppliers");
  }
  if (
    permissions.has("dailyExpenses") &&
    !dailyExpenseSubPermissions.some((permission) =>
      permissions.has(permission),
    )
  )
    dailyExpenseSubPermissions.forEach((permission) =>
      permissions.add(permission),
    );
  if (
    permissions.has("dailyExpenses") ||
    dailyExpenseSubPermissions.some((permission) => permissions.has(permission))
  )
    permissions.add("companyExpenses");
  return permissions.size === group.permissions.length
    ? group
    : { ...group, permissions: [...permissions] };
}

const STORAGE_KEY = "yunqiao-ledger-db-v1";
const SESSION_STORAGE_KEY = "yunqiao-ledger-session-v1";
const SESSION_ACTIVITY_STORAGE_KEY = "yunqiao-ledger-session-activity-v1";
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const NAVIGATION_STORAGE_KEY = "yunqiao-ledger-navigation-v1";
type StoredData = {
  clients: Client[];
  clientGroups: ClientGroup[];
  clientSubgroups: ClientSubgroup[];
  records: RecordItem[];
  payments: PaymentItem[];
  costs: CostItem[];
  dailyExpenses: DailyExpense[];
  customerInfos: CustomerInfo[];
  permissionGroups: PermissionGroup[];
  feeTypes: string[];
  employees: string[];
  costTypes: string[];
  dailyExpenseTypes: string[];
  reimbursers: string[];
  suppliers: string[];
  supplierDetails: SupplierDetails;
  emailSchedule: EmailSchedule;
  auditLogs: AuditLog[];
  users: User[];
  regionCatalog: RegionCatalog;
};
function readStored<T extends keyof StoredData>(
  key: T,
  fallback: StoredData[T],
): StoredData[T] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<StoredData>;
    return data[key] ?? fallback;
  } catch {
    return fallback;
  }
}
function normalizeSupplierDetails(value: unknown): SupplierDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(
    value as Record<string, unknown>,
  ).reduce<SupplierDetails>((result, [name, detail]) => {
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const item = detail as Record<string, unknown>;
      result[name] = {
        contact: typeof item.contact === "string" ? item.contact : "",
        phone: typeof item.phone === "string" ? item.phone : "",
      };
    }
    return result;
  }, {});
}
function readSession(): User | null {
  return null;
}

function readNavigationState() {
  const fallback = {
    active: "dashboard" as const,
    selectedId: "",
    recordTab: "fee" as const,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(NAVIGATION_STORAGE_KEY);
    const value = stored
      ? (JSON.parse(stored) as Partial<{
          active: string;
          selectedId: string;
          recordTab: string;
        }>)
      : {};
    return {
      active:
        value.active === "clients" ||
        value.active === "companyExpenses" ||
        value.active === "dailyExpenses" ||
        value.active === "users"
          ? value.active
          : "dashboard",
      selectedId: typeof value.selectedId === "string" ? value.selectedId : "",
      recordTab:
        value.recordTab === "payment" ||
        value.recordTab === "cost" ||
        value.recordTab === "info"
          ? value.recordTab
          : "fee",
    } as {
      active:
        | "dashboard"
        | "clients"
        | "companyExpenses"
        | "dailyExpenses"
        | "users";
      selectedId: string;
      recordTab: "fee" | "payment" | "cost" | "info";
    };
  } catch {
    return fallback;
  }
}

const makeDocId = (date: string, records: RecordItem[]) => {
  const normalized = date.replace(/-/g, "");
  const prefix =
    normalized.length === 8
      ? normalized
      : new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const next =
    records
      .filter((record) => record.docId?.startsWith(prefix))
      .reduce(
        (max, record) => Math.max(max, Number(record.docId.slice(-3)) || 0),
        0,
      ) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
};

const makeDailyExpenseDocId = (date: string, expenses: DailyExpense[]) => {
  const normalized = date.replace(/-/g, "");
  const prefix =
    normalized.length === 8
      ? normalized
      : new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const next =
    expenses
      .filter((expense) => expense.docId?.startsWith(prefix))
      .reduce(
        (max, expense) =>
          Math.max(max, Number(expense.docId.slice(-4)) || 4999),
        4999,
      ) + 1;
  return `${prefix}${String(Math.max(5000, next)).padStart(4, "0")}`;
};

const toLocalDateTimeInputValue = (value: string | Date = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

const normalizeLoginIdentifier = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, "");
const isPasswordValid = (value: string) => {
  const types = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9\s]/.test(value),
  ].filter(Boolean).length;
  return value.length >= 8 && types >= 3;
};
const money = (n: number) =>
  "¥" +
  n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const MAX_ATTACHMENT_SIZE = 100 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL_SIZE = 200 * 1024 * 1024;
const attachmentAccept = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt";
const formatFileSize = (size: number) =>
  size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
const isSupportedAttachment = (file: File) => {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return (
    file.type.startsWith("image/") ||
    [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt"].includes(extension)
  );
};
const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
const dispatchAuthExpired = () => {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("xinke-auth-expired"));
};
const apiFetch = (input: RequestInfo | URL, init: RequestInit = {}) =>
  fetch(input, { ...init, credentials: "include" }).then((response) => {
    if (response.status === 401) dispatchAuthExpired();
    return response;
  });
const uploadAttachment = async (
  file: File,
  onProgress?: (progress: number) => void,
): Promise<Attachment> => {
  const dataUrl = await readFileAsDataUrl(file);
  onProgress?.(5);
  return await new Promise<Attachment>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/uploads");
    request.withCredentials = true;
    request.setRequestHeader("content-type", "application/json");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress?.(
          Math.min(
            99,
            Math.max(5, Math.round((event.loaded / event.total) * 100)),
          ),
        );
    };
    request.onerror = () => reject(new Error("UPLOAD_FAILED"));
    request.onabort = () => reject(new Error("UPLOAD_ABORTED"));
    request.onload = () => {
      let result: { attachment?: Attachment; error?: string } = {};
      try {
        result = JSON.parse(request.responseText || "{}");
      } catch {
        /* handled by response check */
      }
      if (request.status === 401) dispatchAuthExpired();
      if (request.status < 200 || request.status >= 300 || !result.attachment) {
        reject(
          new Error(
            request.status === 401
              ? "登录已过期，请重新登录"
              : result.error || "UPLOAD_FAILED",
          ),
        );
        return;
      }
      onProgress?.(100);
      resolve(result.attachment);
    };
    request.send(JSON.stringify({ name: file.name, mime: file.type, dataUrl }));
  });
};
const formatClientCreatedAt = (value: string) => {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const datePart = date
    .toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\//g, "-");
  const timePart = /T\d{2}:\d{2}/.test(value)
    ? date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "00:00";
  return `${datePart} ${timePart}`;
};
const customerNameLength = (client: Client) =>
  Array.from(client.company || client.name || "").length;
const sortClientsByNameLength = (items: Client[]) =>
  [...items].sort((a, b) => {
    const lengthDifference = customerNameLength(a) - customerNameLength(b);
    return (
      lengthDifference ||
      (a.company || a.name).localeCompare(b.company || b.name, "zh-CN")
    );
  });
const compareTextLength = (left: string, right: string) => {
  const lengthDifference =
    Array.from(left.trim()).length - Array.from(right.trim()).length;
  return lengthDifference || left.localeCompare(right, "zh-CN");
};
const sortTextValues = (items: string[]) => [...items].sort(compareTextLength);
const monthsBetween = (start: string, end: string) => {
  if (!start || !end) return 0;
  const s = new Date(start),
    e = new Date(end);
  if (e < s) return 0;
  return (
    (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1
  );
};
const daysUntil = (date: string) => {
  if (!date) return null;
  const today = new Date();
  const current = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const target = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.round((target - current) / 86400000);
};

function Modal({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal ${className || (title === "角色权限管理" ? "permission-modal" : "")}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AttachmentPanel({
  note,
  inputRef,
  savedAttachments,
  pendingAttachments,
  onChange,
  onRemoveSaved,
  onRemovePending,
}: {
  note: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  savedAttachments: Attachment[];
  pendingAttachments: PendingAttachment[];
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveSaved: (attachment: Attachment) => void;
  onRemovePending: (id: string) => void;
}) {
  return (
    <div className="record-attachments full">
      <div className="record-attachments-head">
        <div>
          <strong>附件</strong>
          <small>{note}</small>
        </div>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip size={15} />
          添加附件
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept={attachmentAccept}
          onChange={onChange}
        />
      </div>
      <div className="attachment-list" aria-live="polite">
        {savedAttachments.map((attachment) => (
          <div className="attachment-item" key={attachment.id}>
            <a
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              title={`在线预览 ${attachment.name}`}
            >
              {attachment.name}
            </a>
            <span>{formatFileSize(attachment.size)}</span>
            <button
              type="button"
              className="icon-btn danger"
              onClick={() => onRemoveSaved(attachment)}
              aria-label={`删除附件${attachment.name}`}
              title={`删除附件${attachment.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {pendingAttachments.map((attachment) => (
          <div
            className="attachment-item attachment-pending"
            key={attachment.id}
          >
            <a
              href={attachment.previewUrl}
              target="_blank"
              rel="noreferrer"
              title={`预览 ${attachment.name}`}
            >
              {attachment.name}
            </a>
            <div className="attachment-upload-status">
              <span>
                {attachment.status === "error"
                  ? `上传失败：${attachment.error || "请移除后重试"}`
                  : `正在上传 ${attachment.progress}%`}{" "}
                · {formatFileSize(attachment.size)}
              </span>
              {attachment.status === "uploading" && (
                <progress
                  max="100"
                  value={attachment.progress}
                  aria-label={`上传${attachment.name}`}
                />
              )}
            </div>
            <button
              type="button"
              className="icon-btn danger"
              onClick={() => onRemovePending(attachment.id)}
              aria-label={`删除附件${attachment.name}`}
              title={`删除附件${attachment.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!savedAttachments.length && !pendingAttachments.length && (
          <span className="attachment-empty">尚未添加凭证附件</span>
        )}
      </div>
    </div>
  );
}

function RegionManagerModal({
  manager,
  items,
  regionCatalog,
  regionLevelLabels,
  regionName,
  editingRegionName,
  canManage,
  onClose,
  onParentChange,
  onNameChange,
  onEdit,
  onRemove,
  onSave,
}: {
  manager: { level: RegionLevel; province: string; city: string };
  items: string[];
  regionCatalog: RegionCatalog;
  regionLevelLabels: Record<RegionLevel, string>;
  regionName: string;
  editingRegionName: string | null;
  canManage: boolean;
  onClose: () => void;
  onParentChange: (field: "province" | "city", value: string) => void;
  onNameChange: (value: string) => void;
  onEdit: (name: string) => void;
  onRemove: (name: string) => void;
  onSave: () => void;
}) {
  const provinces = sortTextValues(Object.keys(regionCatalog));
  const cities = sortTextValues(
    Object.keys(regionCatalog[manager.province] || {}),
  );
  const sortedItems = sortTextValues(items);
  return (
    <Modal
      title={`${regionLevelLabels[manager.level]}管理`}
      onClose={onClose}
      className="region-manager-modal"
    >
      <div className="region-manager-context">
        <strong>独立管理{regionLevelLabels[manager.level]}分类</strong>
        <span>新增或修改后会同步到筛选和客户资料。</span>
      </div>
      {manager.level !== "province" && (
        <label className="region-manager-parent">
          所属省份/直辖市
          <select
            value={manager.province}
            onChange={(event) => onParentChange("province", event.target.value)}
            disabled={!canManage}
          >
            {provinces.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>
        </label>
      )}
      {manager.level === "district" && (
        <label className="region-manager-parent">
          所属地市
          <select
            value={manager.city}
            onChange={(event) => onParentChange("city", event.target.value)}
            disabled={!canManage}
          >
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="region-manager-list">
        {sortedItems.map((item) => (
          <div className="region-manager-row" key={item}>
            <strong>{item}</strong>
            <div className="region-manager-actions">
              <button
                className="icon-btn"
                onClick={() => onEdit(item)}
                disabled={!canManage}
                aria-label={`编辑${item}`}
                title={`编辑${item}`}
              >
                <Edit3 size={15} />
              </button>
              <button
                className="icon-btn danger"
                onClick={() => onRemove(item)}
                disabled={!canManage}
                aria-label={`删除${item}`}
                title={`删除${item}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
        {!items.length && <div className="empty">暂无分类，请先添加</div>}
      </div>
      <div className="region-manager-add">
        <input
          value={regionName}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={!canManage}
          placeholder={
            editingRegionName
              ? `修改${regionLevelLabels[manager.level]}名称`
              : `新增${regionLevelLabels[manager.level]}名称`
          }
        />
        <button
          className="secondary-btn"
          onClick={onSave}
          disabled={!canManage}
        >
          {editingRegionName ? <Check size={15} /> : <Plus size={15} />}
          {editingRegionName ? "保存修改" : "添加分类"}
        </button>
      </div>
      <div className="modal-actions">
        <button className="primary-btn" onClick={onClose}>
          <Check size={16} />
          完成
        </button>
      </div>
    </Modal>
  );
}

export default function App() {
  const navigation = readNavigationState();
  const [session, setSession] = useState<User | null>(readSession);
  const [login, setLogin] = useState({ identifier: "", password: "" });
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [authChecking, setAuthChecking] = useState(true);
  const [clients, setClients] = useState<Client[]>(() =>
    readStored("clients", seedClients),
  );
  const [regionCatalog, setRegionCatalog] =
    useState<RegionCatalog>(readRegionCatalog);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>(() =>
    readStored("clientGroups", seedGroups),
  );
  const [clientSubgroups, setClientSubgroups] = useState<ClientSubgroup[]>(() =>
    readStored("clientSubgroups", seedSubgroups),
  );
  const [records, setRecords] = useState<RecordItem[]>(() =>
    readStored("records", seedRecords).map((record) => ({
      ...record,
      attachments: normalizeAttachments(record.attachments),
    })),
  );
  const [payments, setPayments] = useState<PaymentItem[]>(() =>
    readStored("payments", []).map((payment) => ({
      ...payment,
      attachments: normalizeAttachments(payment.attachments),
    })),
  );
  const [costs, setCosts] = useState<CostItem[]>(() =>
    readStored("costs", []).map((cost) => ({
      ...cost,
      costType: cost.costType || cost.feeTypes?.[0],
      attachments: normalizeAttachments(cost.attachments),
    })),
  );
  const [dailyExpenses, setDailyExpenses] = useState<DailyExpense[]>(() =>
    readStored("dailyExpenses", []).map((expense) => ({
      ...expense,
      attachments: normalizeAttachments(expense.attachments),
    })),
  );
  const [customerInfos, setCustomerInfos] = useState<CustomerInfo[]>(() =>
    readStored("customerInfos", []),
  );
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>(
    () =>
      readStored("permissionGroups", seedPermissionGroups).map(
        migratePermissionGroup,
      ),
  );
  const [feeTypes, setFeeTypes] = useState<string[]>(() =>
    readStored("feeTypes", seedFeeTypes),
  );
  const [employees, setEmployees] = useState<string[]>(() =>
    sortTextValues(readStored("employees", seedEmployees)),
  );
  const [costTypes, setCostTypes] = useState<string[]>(() =>
    readStored("costTypes", seedCostTypes),
  );
  const [dailyExpenseTypes, setDailyExpenseTypes] = useState<string[]>(() =>
    sortTextValues(readStored("dailyExpenseTypes", seedDailyExpenseTypes)),
  );
  const [reimbursers, setReimbursers] = useState<string[]>(() =>
    sortTextValues(readStored("reimbursers", seedReimbursers)),
  );
  const [suppliers, setSuppliers] = useState<string[]>(() => {
    const stored = readStored("suppliers", seedSuppliers);
    return sortTextValues(stored.length ? stored : seedSuppliers);
  });
  const [supplierDetails, setSupplierDetails] = useState<SupplierDetails>(() =>
    normalizeSupplierDetails(readStored("supplierDetails", {})),
  );
  const [emailSchedule, setEmailSchedule] = useState<EmailSchedule>(() =>
    readStored("emailSchedule", seedEmailSchedule),
  );
  const [emailRecipientsInput, setEmailRecipientsInput] = useState(() =>
    readStored("emailSchedule", seedEmailSchedule).recipients.join(", "),
  );
  const [emailServiceStatus, setEmailServiceStatus] =
    useState<EmailServiceStatus>({ configured: false, from: null });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() =>
    readStored("auditLogs", []),
  );
  const [users, setUsers] = useState<User[]>(() =>
    readStored("users", seedUsers),
  );
  const [serverHydrated, setServerHydrated] = useState(false);
  const [serverSyncPulse, setServerSyncPulse] = useState(0);
  const serverVersion = useRef<number | null>(null);
  const serverSyncTimer = useRef<number | null>(null);
  const serverSyncInFlight = useRef(false);
  const serverSyncQueued = useRef(false);
  const skipServerSync = useRef(false);
  const recordAttachmentInput = useRef<HTMLInputElement | null>(null);
  const recordDateInput = useRef<HTMLInputElement | null>(null);
  const recordPaymentDateInput = useRef<HTMLInputElement | null>(null);
  const paymentAttachmentInput = useRef<HTMLInputElement | null>(null);
  const costAttachmentInput = useRef<HTMLInputElement | null>(null);
  const dailyExpenseAttachmentInput = useRef<HTMLInputElement | null>(null);
  const recordNewUploadIds = useRef<Set<string>>(new Set());
  const paymentNewUploadIds = useRef<Set<string>>(new Set());
  const costNewUploadIds = useRef<Set<string>>(new Set());
  const dailyExpenseNewUploadIds = useRef<Set<string>>(new Set());
  const attachmentUploadGeneration = useRef(0);
  const [active, setActive] = useState<
    "dashboard" | "clients" | "companyExpenses" | "dailyExpenses" | "users"
  >(navigation.active);
  const [clientsExpanded, setClientsExpanded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [expandedSubgroups, setExpandedSubgroups] = useState<string[]>([]);
  const [directoryCollapsedGroups, setDirectoryCollapsedGroups] = useState<
    string[]
  >(() => readStored("clientGroups", seedGroups).map((group) => group.id));
  const [directoryCollapsedSubgroups, setDirectoryCollapsedSubgroups] =
    useState<string[]>(() =>
      readStored("clientSubgroups", seedSubgroups).map(
        (subgroup) => subgroup.id,
      ),
    );
  const [expandedRegionLevels, setExpandedRegionLevels] = useState<string[]>(
    [],
  );
  const previousClientsExpanded = useRef(clientsExpanded);
  const [selectedId, setSelectedId] = useState(navigation.selectedId);
  const [search, setSearch] = useState("");
  const [regionFilters, setRegionFilters] = useState({
    province: "",
    city: "",
    district: "",
    customerTypeId: "",
  });
  const [clientModal, setClientModal] = useState<Client | "new" | null>(null);
  const [regionManager, setRegionManager] = useState<{
    level: RegionLevel;
    province: string;
    city: string;
  } | null>(null);
  const [regionName, setRegionName] = useState("");
  const [editingRegionName, setEditingRegionName] = useState<string | null>(
    null,
  );
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [feeTypeModalOpen, setFeeTypeModalOpen] = useState(false);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [costTypeModalOpen, setCostTypeModalOpen] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [recordModal, setRecordModal] = useState<RecordItem | "new" | null>(
    null,
  );
  const [paymentModal, setPaymentModal] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [recordTab, setRecordTab] = useState<
    "fee" | "payment" | "cost" | "info"
  >(navigation.recordTab);
  const [customerInfoModal, setCustomerInfoModal] = useState(false);
  const [editingCustomerInfoId, setEditingCustomerInfoId] = useState<
    string | null
  >(null);
  const [userModal, setUserModal] = useState<"new" | User | null>(null);
  const [passwordModal, setPasswordModal] = useState(false);
  const [mustChangeOnFirstLogin, setMustChangeOnFirstLogin] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuPinned, setAccountMenuPinned] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [permissionGroupModal, setPermissionGroupModal] = useState(false);
  const [permissionRolesCollapsed, setPermissionRolesCollapsed] =
    useState(false);
  const [permissionAddRoleCollapsed, setPermissionAddRoleCollapsed] =
    useState(false);
  const [permissionChecksCollapsed, setPermissionChecksCollapsed] =
    useState(false);
  const [permissionSaveConfirmOpen, setPermissionSaveConfirmOpen] =
    useState(false);
  const [usersSectionCollapsed, setUsersSectionCollapsed] = useState(true);
  const [emailScheduleCollapsed, setEmailScheduleCollapsed] = useState(true);
  const [auditLogCollapsed, setAuditLogCollapsed] = useState(false);
  const [auditPageSize, setAuditPageSize] = useState(10);
  const [auditPage, setAuditPage] = useState(1);
  const [auditSearch, setAuditSearch] = useState("");
  const [recentClientsCollapsed, setRecentClientsCollapsed] = useState(true);
  const [remindersCollapsed, setRemindersCollapsed] = useState(true);
  const [profitAnalysisCollapsed, setProfitAnalysisCollapsed] = useState(true);
  const [profitFilters, setProfitFilters] = useState({
    startDate: "",
    endDate: "",
    employee: "",
    clientId: "",
    feeType: "",
    docId: "",
  });
  const [profitAnalysisPageSize, setProfitAnalysisPageSize] = useState(10);
  const [profitAnalysisPage, setProfitAnalysisPage] = useState(1);
  const [recentClientsPageSize, setRecentClientsPageSize] = useState(10);
  const [recentClientsPage, setRecentClientsPage] = useState(1);
  const [remindersPageSize, setRemindersPageSize] = useState(10);
  const [remindersPage, setRemindersPage] = useState(1);
  const [clientPageSize, setClientPageSize] = useState(10);
  const [clientPage, setClientPage] = useState(1);
  const [detailFeePageSize, setDetailFeePageSize] = useState(10);
  const [detailFeePage, setDetailFeePage] = useState(1);
  const [detailPaymentPageSize, setDetailPaymentPageSize] = useState(10);
  const [detailPaymentPage, setDetailPaymentPage] = useState(1);
  const [detailCostPageSize, setDetailCostPageSize] = useState(10);
  const [detailCostPage, setDetailCostPage] = useState(1);
  const [detailInfoPageSize, setDetailInfoPageSize] = useState(10);
  const [detailInfoPage, setDetailInfoPage] = useState(1);
  const [arrearsCollapsed, setArrearsCollapsed] = useState(true);
  const [formClient, setFormClient] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
    startDate: "",
    endDate: "",
    province: defaultProvince,
    city: defaultCity,
    district: defaultDistrict,
    customerTypeId: "g1",
    groupId: "g1",
    subgroupId: "",
  });
  const [groupName, setGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [subgroupName, setSubgroupName] = useState("");
  const [subgroupParentId, setSubgroupParentId] = useState<string | null>(null);
  const [editingSubgroupId, setEditingSubgroupId] = useState<string | null>(
    null,
  );
  const [feeTypeName, setFeeTypeName] = useState("");
  const [editingFeeType, setEditingFeeType] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [costTypeName, setCostTypeName] = useState("");
  const [editingCostType, setEditingCostType] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [formRecord, setFormRecord] = useState({
    start: "",
    end: "",
    recordDate: toLocalDateTimeInputValue().slice(0, 10),
    fee: "0",
    paid: "0",
    paymentDate: toLocalDateTimeInputValue().slice(0, 10),
    method: "",
    feeType: "",
    employee: "",
    projectName: "",
    note: "",
  });
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [savedAttachments, setSavedAttachments] = useState<Attachment[]>([]);
  const [attachmentsToDelete, setAttachmentsToDelete] = useState<Attachment[]>(
    [],
  );
  const [recordSaving, setRecordSaving] = useState(false);
  const [formPayment, setFormPayment] = useState({
    docId: "",
    paymentDate: toLocalDateTimeInputValue().slice(0, 10),
    expectedPaymentDate: "",
    method: "",
    amount: "",
    note: "",
  });
  const [pendingPaymentAttachments, setPendingPaymentAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [savedPaymentAttachments, setSavedPaymentAttachments] = useState<
    Attachment[]
  >([]);
  const [paymentAttachmentsToDelete, setPaymentAttachmentsToDelete] = useState<
    Attachment[]
  >([]);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [costModal, setCostModal] = useState<CostItem | "new" | null>(null);
  const [formCost, setFormCost] = useState({
    docId: "",
    supplier: "",
    reimburser: "",
    costType: "",
    amount: "",
    note: "",
    createdAt: "",
  });
  const [pendingCostAttachments, setPendingCostAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [savedCostAttachments, setSavedCostAttachments] = useState<
    Attachment[]
  >([]);
  const [costAttachmentsToDelete, setCostAttachmentsToDelete] = useState<
    Attachment[]
  >([]);
  const [costSaving, setCostSaving] = useState(false);
  const [dailyExpenseModal, setDailyExpenseModal] = useState<
    DailyExpense | "new" | null
  >(null);
  const [formDailyExpense, setFormDailyExpense] = useState({
    recordDate: toLocalDateTimeInputValue().slice(0, 10),
    expenseType: "",
    reimburser: "",
    amount: "",
    note: "",
  });
  const [pendingDailyExpenseAttachments, setPendingDailyExpenseAttachments] =
    useState<PendingAttachment[]>([]);
  const [savedDailyExpenseAttachments, setSavedDailyExpenseAttachments] =
    useState<Attachment[]>([]);
  const [dailyExpenseAttachmentsToDelete, setDailyExpenseAttachmentsToDelete] =
    useState<Attachment[]>([]);
  const [dailyExpenseSaving, setDailyExpenseSaving] = useState(false);
  const [dailyExpenseTypeName, setDailyExpenseTypeName] = useState("");
  const [editingDailyExpenseType, setEditingDailyExpenseType] = useState<
    string | null
  >(null);
  const [dailyExpenseTypeManagerOpen, setDailyExpenseTypeManagerOpen] =
    useState(false);
  const [reimburserName, setReimburserName] = useState("");
  const [editingReimburser, setEditingReimburser] = useState<string | null>(
    null,
  );
  const [reimburserManagerOpen, setReimburserManagerOpen] = useState(false);
  const [reimburserManagerScope, setReimburserManagerScope] = useState<
    "daily" | "cost"
  >("daily");
  const [companyExpenseFilters, setCompanyExpenseFilters] = useState({
    startDate: "",
    endDate: "",
    expenseType: "",
    reimburser: "",
  });
  const [companyExpenseCollapsed, setCompanyExpenseCollapsed] = useState(true);
  const [companyExpensesExpanded, setCompanyExpensesExpanded] = useState(false);
  const [companyExpensePageSize, setCompanyExpensePageSize] = useState(10);
  const [companyExpensePage, setCompanyExpensePage] = useState(1);
  const [dailyExpensePageSize, setDailyExpensePageSize] = useState(10);
  const [dailyExpensePage, setDailyExpensePage] = useState(1);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [costRecordSelection, setCostRecordSelection] = useState("");
  const [formCustomerInfo, setFormCustomerInfo] = useState({
    name: "",
    note: "",
  });
  const [formUser, setFormUser] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    role: "财务" as Role,
  });
  const [permissionGroupName, setPermissionGroupName] = useState("");
  const [editingPermissionGroupId, setEditingPermissionGroupId] = useState<
    string | null
  >(null);
  const [permissionGroupPermissions, setPermissionGroupPermissions] = useState<
    PermissionKey[]
  >(allPermissions.map((item) => item.key));
  const [toast, setToast] = useState("");
  const sessionPermissionGroup = session?.permissionGroupId
    ? permissionGroups.find((group) => group.id === session.permissionGroupId)
    : undefined;
  const canAccess = (permission: PermissionKey) =>
    session?.role === "管理员" ||
    !sessionPermissionGroup ||
    sessionPermissionGroup.permissions.includes(permission);
  const canManageClientGroups =
    session?.role !== "查看者" && canAccess("clientGroups");
  const canManageClientProvince =
    session?.role !== "查看者" && canAccess("clientProvince");
  const canManageClientCity =
    session?.role !== "查看者" && canAccess("clientCity");
  const canManageClientDistrict =
    session?.role !== "查看者" && canAccess("clientDistrict");
  const canManageRegionLevel = (level: RegionLevel) =>
    level === "province"
      ? canManageClientProvince
      : level === "city"
        ? canManageClientCity
        : canManageClientDistrict;
  const canCreateClient =
    session?.role !== "查看者" && canAccess("clientCreate");
  const canEditClient = session?.role !== "查看者" && canAccess("clientEdit");
  const canDeleteClient =
    session?.role !== "查看者" && canAccess("clientDelete");
  const canViewDashboard = canAccess("dashboard");
  const canViewClients = canAccess("clients");
  const canViewCompanyExpenses = canAccess("companyExpenses");
  const canViewDailyExpenses = canAccess("dailyExpenses");
  const canManageDailyExpenseTypes =
    session?.role !== "查看者" && canAccess("dailyExpenseTypes");
  const canManageDailyExpenseReimbursers =
    session?.role !== "查看者" && canAccess("dailyExpenseReimbursers");
  const canCreateDailyExpense =
    session?.role !== "查看者" && canAccess("dailyExpenseCreate");
  const canEditDailyExpense =
    session?.role !== "查看者" && canAccess("dailyExpenseEdit");
  const canDeleteDailyExpense =
    session?.role !== "查看者" && canAccess("dailyExpenseDelete");
  const canViewUsers = canAccess("users");
  const canViewFee = canAccess("fee");
  const canViewPayment = canAccess("payment");
  const canViewInfo = canAccess("info");
  const canManageFeeTypes = session?.role !== "查看者" && canAccess("feeTypes");
  const canManageEmployees =
    session?.role !== "查看者" && canAccess("employees");
  const canManageCostTypes =
    session?.role !== "查看者" && canAccess("costTypes");
  const canManageCostReimbursers =
    session?.role !== "查看者" && canAccess("costReimbursers");
  const canManageCostSuppliers =
    session?.role !== "查看者" && canAccess("costSuppliers");
  const canManageActiveReimbursers =
    reimburserManagerScope === "cost"
      ? canManageCostReimbursers
      : canManageDailyExpenseReimbursers;
  const canCreateFee = session?.role !== "查看者" && canAccess("feeCreate");
  const canEditFee = session?.role !== "查看者" && canAccess("feeEdit");
  const canEditFeePayment =
    session?.role !== "查看者" && canAccess("feePayment");
  const canDeleteFee = session?.role !== "查看者" && canAccess("feeDelete");
  const canCreatePayment =
    session?.role !== "查看者" && canAccess("paymentCreate");
  const canEditPaymentRecord =
    session?.role !== "查看者" && canAccess("paymentEdit");
  const canDeletePayment =
    session?.role !== "查看者" && canAccess("paymentDelete");
  const canViewCost = canAccess("cost");
  const canCreateCost = session?.role !== "查看者" && canAccess("costCreate");
  const canEditCost = session?.role !== "查看者" && canAccess("costEdit");
  const canDeleteCost = session?.role !== "查看者" && canAccess("costDelete");
  const canCreateInfo = session?.role !== "查看者" && canAccess("infoCreate");
  const canEditInfoRecord = session?.role !== "查看者" && canAccess("infoEdit");
  const canDeleteInfo = session?.role !== "查看者" && canAccess("infoDelete");
  const preferredRecordTab: "fee" | "payment" | "cost" | "info" = canViewFee
    ? "fee"
    : canViewPayment
      ? "payment"
      : canViewCost
        ? "cost"
        : "info";
  const visibleRecordTab =
    recordTab === "fee"
      ? canViewFee
        ? recordTab
        : preferredRecordTab
      : recordTab === "payment"
        ? canViewPayment
          ? recordTab
          : preferredRecordTab
        : recordTab === "cost"
          ? canViewCost
            ? recordTab
            : preferredRecordTab
          : canViewInfo
            ? recordTab
            : preferredRecordTab;
  const selected = clients.find((c) => c.id === selectedId);
  const selectedRecords = records.filter((r) => r.clientId === selected?.id);
  const selectedCosts = costs.filter((cost) => cost.clientId === selected?.id);
  const selectedCostRecords = costRecordSelection
    ? selectedRecords.filter((record) => record.docId === costRecordSelection)
    : selectedRecords;
  const selectedCostItems = selectedCosts.filter((cost) =>
    selectedCostRecords.some((record) => record.docId === cost.docId),
  );
  const filteredSuppliers = sortTextValues(
    suppliers.filter((supplier) =>
      supplier
        .toLocaleLowerCase()
        .includes(supplierSearch.trim().toLocaleLowerCase()),
    ),
  );
  const costRecordKey = selectedRecords.map((record) => record.docId).join("|");
  const selectedCustomerInfos = customerInfos.filter(
    (info) => info.clientId === selected?.id,
  );
  const selectedPayments = payments.filter(
    (payment) => payment.clientId === selected?.id,
  );
  const selectedCostRows = selectedCostRecords.flatMap(renderCostRows);
  const detailFeePageCount = Math.max(
    1,
    Math.ceil(selectedRecords.length / detailFeePageSize),
  );
  const detailFeePageEntries = selectedRecords.slice(
    (detailFeePage - 1) * detailFeePageSize,
    detailFeePage * detailFeePageSize,
  );
  const detailPaymentPageCount = Math.max(
    1,
    Math.ceil(selectedPayments.length / detailPaymentPageSize),
  );
  const detailPaymentPageEntries = selectedPayments.slice(
    (detailPaymentPage - 1) * detailPaymentPageSize,
    detailPaymentPage * detailPaymentPageSize,
  );
  const detailCostPageCount = Math.max(
    1,
    Math.ceil(selectedCostRows.length / detailCostPageSize),
  );
  const detailCostPageEntries = selectedCostRows.slice(
    (detailCostPage - 1) * detailCostPageSize,
    detailCostPage * detailCostPageSize,
  );
  const detailInfoPageCount = Math.max(
    1,
    Math.ceil(selectedCustomerInfos.length / detailInfoPageSize),
  );
  const detailInfoPageEntries = selectedCustomerInfos.slice(
    (detailInfoPage - 1) * detailInfoPageSize,
    detailInfoPage * detailInfoPageSize,
  );
  useEffect(() => {
    setCostRecordSelection("");
  }, [selected?.id, costRecordKey]);
  function costAmountForRecord(docId: string) {
    return selectedCostItems
      .filter((cost) => cost.docId === docId)
      .reduce((sum, cost) => sum + cost.amount, 0);
  }
  const paidFor = (record: RecordItem) =>
    record.paid +
    payments
      .filter((payment) => payment.docId === record.docId)
      .reduce((sum, payment) => sum + payment.amount, 0);
  const totals = useMemo(
    () => ({
      total: records.reduce((s, r) => s + r.fee, 0),
      paid: records.reduce((s, r) => s + paidFor(r), 0),
    }),
    [records, payments],
  );
  const reminderRecords = useMemo(
    () =>
      records.filter((record) => {
        const days = daysUntil(record.paymentDate);
        return record.fee > paidFor(record) && days !== null && days <= 10;
      }),
    [records, payments],
  );
  const latestClients = useMemo(
    () =>
      [...clients]
        .sort((a, b) => {
          const dateDifference =
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          return (
            (Number.isNaN(dateDifference) ? 0 : dateDifference) ||
            a.company.localeCompare(b.company, "zh-CN")
          );
        })
        .slice(0, 100),
    [clients],
  );
  const recentClientsPageCount = Math.max(
    1,
    Math.ceil(latestClients.length / recentClientsPageSize),
  );
  const recentClientsPageEntries = latestClients.slice(
    (recentClientsPage - 1) * recentClientsPageSize,
    recentClientsPage * recentClientsPageSize,
  );
  const remindersPageCount = Math.max(
    1,
    Math.ceil(reminderRecords.length / remindersPageSize),
  );
  const remindersPageEntries = reminderRecords.slice(
    (remindersPage - 1) * remindersPageSize,
    remindersPage * remindersPageSize,
  );
  const profitAnalysisEmployees = useMemo(
    () =>
      sortTextValues([
        ...new Set(
          records.map((record) => record.employee).filter(Boolean) as string[],
        ),
      ]),
    [records],
  );
  const profitAnalysisClients = useMemo(
    () =>
      [...clients].sort((left, right) =>
        left.company.localeCompare(right.company, "zh-CN"),
      ),
    [clients],
  );
  const profitAnalysisDocumentOptions = useMemo(
    () =>
      records
        .filter((record) => {
          const date = record.recordDate || record.start;
          return (
            (!profitFilters.startDate || date >= profitFilters.startDate) &&
            (!profitFilters.endDate || date <= profitFilters.endDate) &&
            (!profitFilters.employee ||
              record.employee === profitFilters.employee) &&
            (!profitFilters.clientId ||
              record.clientId === profitFilters.clientId) &&
            (!profitFilters.feeType ||
              record.feeType === profitFilters.feeType)
          );
        })
        .sort((left, right) =>
          (right.recordDate || right.start).localeCompare(
            left.recordDate || left.start,
          ),
        ),
    [
      records,
      profitFilters.startDate,
      profitFilters.endDate,
      profitFilters.employee,
      profitFilters.clientId,
      profitFilters.feeType,
    ],
  );
  const profitAnalysisRows = useMemo(
    () =>
      records
        .filter((record) => {
          const date = record.recordDate || record.start;
          return (
            (!profitFilters.startDate || date >= profitFilters.startDate) &&
            (!profitFilters.endDate || date <= profitFilters.endDate) &&
            (!profitFilters.employee ||
              record.employee === profitFilters.employee) &&
            (!profitFilters.clientId ||
              record.clientId === profitFilters.clientId) &&
            (!profitFilters.feeType ||
              record.feeType === profitFilters.feeType) &&
            (!profitFilters.docId || record.docId === profitFilters.docId)
          );
        })
        .map((record) => {
          const revenue = record.fee;
          const cost = costs
            .filter(
              (item) =>
                item.clientId === record.clientId &&
                item.docId === record.docId,
            )
            .reduce((sum, item) => sum + item.amount, 0);
          const received =
            record.paid +
            payments
              .filter(
                (payment) =>
                  payment.clientId === record.clientId &&
                  payment.docId === record.docId,
              )
              .reduce((sum, payment) => sum + payment.amount, 0);
          return {
            id: record.id,
            clientId: record.clientId,
            docId: record.docId,
            startDate: record.recordDate || record.start,
            endDate: record.end || "",
            client:
              clients.find((client) => client.id === record.clientId)
                ?.company || "未知客户",
            feeType: record.feeType || "未设置",
            employee: record.employee || "未设置",
            revenue,
            cost,
            profit: revenue - cost,
            arrears: Math.max(0, revenue - received),
          };
        })
        .sort((left, right) => right.startDate.localeCompare(left.startDate)),
    [records, costs, payments, clients, profitFilters],
  );
  const profitAnalysisSummary = useMemo(
    () =>
      profitAnalysisRows.reduce(
        (summary, row) => ({
          revenue: summary.revenue + row.revenue,
          cost: summary.cost + row.cost,
          profit: summary.profit + row.profit,
          arrears: summary.arrears + row.arrears,
        }),
        { revenue: 0, cost: 0, profit: 0, arrears: 0 },
      ),
    [profitAnalysisRows],
  );
  const profitAnalysisPageCount = Math.max(
    1,
    Math.ceil(profitAnalysisRows.length / profitAnalysisPageSize),
  );
  const profitAnalysisPageEntries = profitAnalysisRows.slice(
    (profitAnalysisPage - 1) * profitAnalysisPageSize,
    profitAnalysisPage * profitAnalysisPageSize,
  );
  useEffect(() => {
    setProfitAnalysisPage(1);
  }, [profitFilters]);
  useEffect(() => {
    setProfitAnalysisPage((current) =>
      Math.min(current, profitAnalysisPageCount),
    );
  }, [profitAnalysisPageCount]);
  const companyExpenseRows = useMemo(
    () =>
      dailyExpenses
        .filter(
          (expense) =>
            (!companyExpenseFilters.startDate ||
              expense.recordDate >= companyExpenseFilters.startDate) &&
            (!companyExpenseFilters.endDate ||
              expense.recordDate <= companyExpenseFilters.endDate) &&
            (!companyExpenseFilters.expenseType ||
              expense.expenseType === companyExpenseFilters.expenseType) &&
            (!companyExpenseFilters.reimburser ||
              expense.reimburser === companyExpenseFilters.reimburser),
        )
        .sort(
          (left, right) =>
            right.recordDate.localeCompare(left.recordDate) ||
            right.docId.localeCompare(left.docId),
        ),
    [dailyExpenses, companyExpenseFilters],
  );
  const companyExpenseTotal = useMemo(
    () =>
      companyExpenseRows.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0,
      ),
    [companyExpenseRows],
  );
  const companyExpenseAverage = companyExpenseRows.length
    ? companyExpenseTotal / companyExpenseRows.length
    : 0;
  const companyExpensePageCount = Math.max(
    1,
    Math.ceil(companyExpenseRows.length / companyExpensePageSize),
  );
  const companyExpensePageEntries = companyExpenseRows.slice(
    (companyExpensePage - 1) * companyExpensePageSize,
    companyExpensePage * companyExpensePageSize,
  );
  useEffect(() => {
    setCompanyExpensePage(1);
  }, [companyExpenseFilters]);
  useEffect(() => {
    setCompanyExpensePage((current) =>
      Math.min(current, companyExpensePageCount),
    );
  }, [companyExpensePageCount]);
  const dailyExpenseRows = useMemo(
    () =>
      [...dailyExpenses].sort(
        (left, right) =>
          right.recordDate.localeCompare(left.recordDate) ||
          right.docId.localeCompare(left.docId),
      ),
    [dailyExpenses],
  );
  const dailyExpensePageCount = Math.max(
    1,
    Math.ceil(dailyExpenseRows.length / dailyExpensePageSize),
  );
  const dailyExpensePageEntries = dailyExpenseRows.slice(
    (dailyExpensePage - 1) * dailyExpensePageSize,
    dailyExpensePage * dailyExpensePageSize,
  );
  useEffect(() => {
    setDailyExpensePage((current) => Math.min(current, dailyExpensePageCount));
  }, [dailyExpensePageCount]);
  const searchActive = search.trim().length > 0;
  const searchFilteredClients = clients.filter((c) => {
    const typeName =
      clientGroups.find((group) => group.id === (c.customerTypeId || c.groupId))
        ?.name || "";
    return [
      c.name,
      c.company,
      c.phone,
      c.email,
      c.province || "",
      c.city || "",
      c.district || "",
      typeName,
    ].some((v) => v.toLowerCase().includes(search.toLowerCase()));
  });
  const cityFilterClients = searchFilteredClients.filter(
    (client) =>
      !regionFilters.province || client.province === regionFilters.province,
  );
  const districtFilterClients = cityFilterClients.filter(
    (client) => !regionFilters.city || client.city === regionFilters.city,
  );
  const typeFilterClients = districtFilterClients.filter(
    (client) =>
      !regionFilters.district || client.district === regionFilters.district,
  );
  const regionProvinceOptions = sortTextValues([
    ...new Set([
      ...Object.keys(regionCatalog),
      ...(searchFilteredClients
        .map((client) => client.province)
        .filter(Boolean) as string[]),
    ]),
  ]);
  const regionCityOptions = sortTextValues([
    ...new Set([
      ...Object.keys(regionCatalog[regionFilters.province] || {}),
      ...(cityFilterClients
        .map((client) => client.city)
        .filter(Boolean) as string[]),
    ]),
  ]);
  const regionDistrictOptions = sortTextValues([
    ...new Set([
      ...(regionCatalog[regionFilters.province]?.[regionFilters.city] || []),
      ...(districtFilterClients
        .map((client) => client.district)
        .filter(Boolean) as string[]),
    ]),
  ]);
  const regionTypeOptions = clientGroups
    .filter((type) =>
      typeFilterClients.some(
        (client) => (client.customerTypeId || client.groupId) === type.id,
      ),
    )
    .sort((a, b) => compareTextLength(a.name, b.name));
  const managedRegionItems = getManagedRegionItems(regionManager);
  const filteredClients = typeFilterClients.filter(
    (client) =>
      !regionFilters.customerTypeId ||
      (client.customerTypeId || client.groupId) ===
        regionFilters.customerTypeId,
  );
  const clientPageCount = Math.max(
    1,
    Math.ceil(filteredClients.length / clientPageSize),
  );
  const sortedClientRows = [...filteredClients].sort((a, b) => {
    const typeName = (client: Client) =>
      clientGroups.find(
        (group) => group.id === (client.customerTypeId || client.groupId),
      )?.name || "未设置客户类型";
    const left = [
      a.province || "未设置省份",
      a.city || "未设置地市",
      a.district || "未设置区县",
      typeName(a),
      a.company || a.name,
    ];
    const right = [
      b.province || "未设置省份",
      b.city || "未设置地市",
      b.district || "未设置区县",
      typeName(b),
      b.company || b.name,
    ];
    for (let index = 0; index < left.length; index += 1) {
      const difference = compareTextLength(left[index], right[index]);
      if (difference) return difference;
    }
    return a.id.localeCompare(b.id);
  });
  const clientPageEntries = sortedClientRows.slice(
    (clientPage - 1) * clientPageSize,
    clientPage * clientPageSize,
  );
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
  const recordAudit = (
    action: AuditAction,
    entity: string,
    summary: string,
    entityId?: string,
  ) => {
    if (!session) return;
    setAuditLogs((current) =>
      [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          userId: session.id,
          username: session.username || session.name,
          action,
          entity,
          entityId,
          summary,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 1000),
    );
  };
  const getDataSnapshot = (): StoredData => ({
    clients,
    clientGroups,
    clientSubgroups,
    records,
    payments,
    costs,
    dailyExpenses,
    customerInfos,
    permissionGroups,
    feeTypes,
    employees,
    costTypes,
    dailyExpenseTypes,
    reimbursers,
    suppliers,
    supplierDetails,
    emailSchedule,
    auditLogs,
    users,
    regionCatalog,
  });
  const applyServerData = (data: Partial<StoredData>) => {
    if (data.clients)
      setClients(
        data.clients.map((client) =>
          migrateClientLocation(
            client,
            data.clientGroups || clientGroups,
            data.clientSubgroups || clientSubgroups,
          ),
        ),
      );
    if (data.clientGroups) setClientGroups(data.clientGroups);
    if (data.clientSubgroups) setClientSubgroups(data.clientSubgroups);
    if (data.records)
      setRecords(
        data.records.map((record) => ({
          ...record,
          attachments: normalizeAttachments(record.attachments),
        })),
      );
    if (data.payments)
      setPayments(
        data.payments.map((payment) => ({
          ...payment,
          attachments: normalizeAttachments(payment.attachments),
        })),
      );
    if (data.costs)
      setCosts(
        data.costs.map((cost) => ({
          ...cost,
          attachments: normalizeAttachments(cost.attachments),
        })),
      );
    if (data.dailyExpenses)
      setDailyExpenses(
        data.dailyExpenses.map((expense) => ({
          ...expense,
          attachments: normalizeAttachments(expense.attachments),
        })),
      );
    if (data.customerInfos) setCustomerInfos(data.customerInfos);
    if (data.permissionGroups)
      setPermissionGroups(data.permissionGroups.map(migratePermissionGroup));
    if (data.feeTypes) setFeeTypes(data.feeTypes);
    if (data.employees) setEmployees(sortTextValues(data.employees));
    if (data.costTypes) setCostTypes(data.costTypes);
    if (data.dailyExpenseTypes)
      setDailyExpenseTypes(
        sortTextValues(
          data.dailyExpenseTypes.length
            ? data.dailyExpenseTypes
            : seedDailyExpenseTypes,
        ),
      );
    if (data.reimbursers)
      setReimbursers(
        sortTextValues(
          data.reimbursers.length ? data.reimbursers : seedReimbursers,
        ),
      );
    if (data.suppliers)
      setSuppliers(
        sortTextValues(data.suppliers.length ? data.suppliers : seedSuppliers),
      );
    if (data.supplierDetails)
      setSupplierDetails(normalizeSupplierDetails(data.supplierDetails));
    if (data.emailSchedule) {
      setEmailSchedule({
        ...data.emailSchedule,
        weekDay: data.emailSchedule.weekDay ?? 1,
        monthDay: data.emailSchedule.monthDay ?? 1,
      });
      setEmailRecipientsInput(data.emailSchedule.recipients.join(", "));
    }
    if (data.auditLogs) setAuditLogs(data.auditLogs);
    if (data.users) setUsers(data.users);
    if (data.regionCatalog) setRegionCatalog(data.regionCatalog);
  };
  const parseRecipients = (value: string) => [
    ...new Set(
      value
        .split(/[;,\s]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const openReminderDraft = async () => {
    const recipients = parseRecipients(emailRecipientsInput);
    if (!recipients.length) {
      notify("请先填写至少一个邮箱地址");
      return;
    }
    if (recipients.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      notify("请输入正确的邮箱地址");
      return;
    }
    try {
      const response = await apiFetch("/api/email/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipients }),
      });
      const result = (await response.json()) as {
        error?: string;
        sent?: boolean;
      };
      if (!response.ok || !result.sent) {
        notify(result.error || "邮件发送失败");
        return;
      }
      setEmailSchedule((current) => ({
        ...current,
        recipients,
        lastTestAt: new Date().toISOString(),
      }));
      recordAudit(
        "send",
        "收款提醒邮件",
        `测试发送收款提醒至：${recipients.join(", ")}`,
      );
      notify("测试邮件已发送");
    } catch {
      notify("邮件服务暂时不可用，请检查服务器SMTP配置");
    }
  };
  const saveEmailSchedule = () => {
    const recipients = parseRecipients(emailRecipientsInput);
    if (recipients.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      notify("请输入正确的邮箱地址");
      return;
    }
    setEmailSchedule((current) => ({ ...current, recipients }));
    setEmailRecipientsInput(recipients.join(", "));
    recordAudit(
      "update",
      "定时邮件设置",
      `修改定时邮件设置：${emailSchedule.frequency}，${recipients.length} 个收件邮箱`,
    );
    notify("定时邮件设置已保存");
  };
  const setChildPermission = (
    current: PermissionKey[],
    parent: PermissionKey,
    children: PermissionKey[],
    permission: PermissionKey,
    enabled: boolean,
  ) => {
    if (enabled)
      return [...new Set<PermissionKey>([...current, parent, permission])];
    const next = current.filter((key) => key !== permission);
    return children.some((key) => next.includes(key))
      ? next
      : next.filter((key) => key !== parent);
  };
  const setPermissionEnabled = (permission: PermissionKey, enabled: boolean) =>
    setPermissionGroupPermissions((current) => {
      if (permission === "clients")
        return enabled
          ? [
              ...new Set<PermissionKey>([
                ...current,
                "clients",
                ...clientSubPermissions,
              ]),
            ]
          : current.filter(
              (key) => key !== "clients" && !clientSubPermissions.includes(key),
            );
      if (permission === "fee")
        return enabled
          ? [
              ...new Set<PermissionKey>([
                ...current,
                "fee",
                ...feeSubPermissions,
              ]),
            ]
          : current.filter(
              (key) => key !== "fee" && !feeSubPermissions.includes(key),
            );
      if (permission === "payment")
        return enabled
          ? [
              ...new Set<PermissionKey>([
                ...current,
                "payment",
                ...paymentSubPermissions,
              ]),
            ]
          : current.filter(
              (key) =>
                key !== "payment" && !paymentSubPermissions.includes(key),
            );
      if (permission === "cost")
        return enabled
          ? [
              ...new Set<PermissionKey>([
                ...current,
                "cost",
                ...costSubPermissions,
              ]),
            ]
          : current.filter(
              (key) => key !== "cost" && !costSubPermissions.includes(key),
            );
      if (permission === "info")
        return enabled
          ? [
              ...new Set<PermissionKey>([
                ...current,
                "info",
                ...infoSubPermissions,
              ]),
            ]
          : current.filter(
              (key) => key !== "info" && !infoSubPermissions.includes(key),
            );
      if (permission === "companyExpenses")
        return enabled
          ? [
              ...new Set<PermissionKey>([
                ...current,
                "companyExpenses",
                ...dailyExpensePermissions,
              ]),
            ]
          : current.filter(
              (key) =>
                key !== "companyExpenses" &&
                !dailyExpensePermissions.includes(key),
            );
      if (permission === "dailyExpenses")
        return enabled
          ? [
              ...new Set<PermissionKey>([
                ...current,
                "companyExpenses",
                ...dailyExpensePermissions,
              ]),
            ]
          : current.filter(
              (key) =>
                key !== "dailyExpenses" &&
                !dailyExpenseSubPermissions.includes(key),
            );
      if (clientSubPermissions.includes(permission))
        return setChildPermission(
          current,
          "clients",
          clientSubPermissions,
          permission,
          enabled,
        );
      if (feeSubPermissions.includes(permission))
        return setChildPermission(
          current,
          "fee",
          feeSubPermissions,
          permission,
          enabled,
        );
      if (paymentSubPermissions.includes(permission))
        return setChildPermission(
          current,
          "payment",
          paymentSubPermissions,
          permission,
          enabled,
        );
      if (costSubPermissions.includes(permission))
        return setChildPermission(
          current,
          "cost",
          costSubPermissions,
          permission,
          enabled,
        );
      if (infoSubPermissions.includes(permission))
        return setChildPermission(
          current,
          "info",
          infoSubPermissions,
          permission,
          enabled,
        );
      if (dailyExpenseSubPermissions.includes(permission)) {
        const next = setChildPermission(
          current,
          "dailyExpenses",
          dailyExpenseSubPermissions,
          permission,
          enabled,
        );
        return next.includes("dailyExpenses")
          ? [...new Set<PermissionKey>([...next, "companyExpenses"])]
          : next;
      }
      return enabled
        ? [...new Set<PermissionKey>([...current, permission])]
        : current.filter((key) => key !== permission);
    });
  const closeAccountMenu = () => {
    setAccountMenuOpen(false);
    setAccountMenuPinned(false);
  };
  const handleAccountMenuEnter = () => {
    if (!accountMenuPinned) setAccountMenuOpen(true);
  };
  const handleAccountMenuLeave = () => {
    if (!accountMenuPinned) setAccountMenuOpen(false);
  };
  const toggleAccountMenu = () => {
    if (accountMenuPinned) {
      closeAccountMenu();
      return;
    }
    setAccountMenuOpen(true);
    setAccountMenuPinned(true);
  };
  const logout = () => {
    void apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSession(null);
  };

  useEffect(() => {
    const handleAuthExpired = () => {
      attachmentUploadGeneration.current += 1;
      setSession(null);
      setAuthChecking(false);
    };
    window.addEventListener("xinke-auth-expired", handleAuthExpired);
    return () =>
      window.removeEventListener("xinke-auth-expired", handleAuthExpired);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/auth/me", { headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("unauthenticated");
        return response.json() as Promise<{ user: User }>;
      })
      .then((result) => {
        if (!cancelled) setSession(result.user);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setServerHydrated(false);
      return;
    }
    let cancelled = false;
    apiFetch("/api/state", { headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("state api unavailable");
        return response.json() as Promise<{
          version: number;
          payload: StoredData | null;
        }>;
      })
      .then((remote) => {
        if (cancelled) return;
        serverVersion.current = remote.version;
        if (remote.payload) {
          skipServerSync.current = true;
          applyServerData(remote.payload);
        }
        setServerHydrated(true);
      })
      .catch(() => {
        // Keep the local fallback available when the API is not running.
        setServerHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    apiFetch("/api/email/status", { headers: { accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((status) => {
        if (status?.configured !== undefined)
          setEmailServiceStatus(status as EmailServiceStatus);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!serverHydrated) return;
    if (skipServerSync.current) {
      skipServerSync.current = false;
      return;
    }
    if (serverSyncTimer.current) window.clearTimeout(serverSyncTimer.current);
    serverSyncTimer.current = window.setTimeout(async () => {
      if (serverSyncInFlight.current) {
        serverSyncQueued.current = true;
        return;
      }
      serverSyncInFlight.current = true;
      try {
        const response = await apiFetch("/api/state", {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "if-match": String(serverVersion.current ?? 0),
          },
          body: JSON.stringify({ payload: getDataSnapshot() }),
        });
        const result = (await response.json()) as {
          version?: number;
          payload?: StoredData;
          error?: string;
        };
        if (response.status === 409 && result.payload) {
          serverVersion.current = result.version ?? serverVersion.current;
          // Preserve local edits when another tab/server writer advanced the version.
          // Local records are authoritative for IDs already present locally; remote-only
          // records are retained and the merged snapshot is retried on the next effect.
          const mergeById = <T extends { id: string }>(
            remoteItems: T[] | undefined,
            localItems: T[],
          ) => {
            const localById = new Map(
              localItems.map((item) => [item.id, item]),
            );
            const merged = (remoteItems || []).map(
              (item) => localById.get(item.id) || item,
            );
            const remoteIds = new Set(
              (remoteItems || []).map((item) => item.id),
            );
            return [
              ...localItems.filter((item) => !remoteIds.has(item.id)),
              ...merged,
            ];
          };
          const mergedPayload = {
            ...result.payload,
            clients: mergeById(result.payload.clients, clients),
            clientGroups: mergeById(result.payload.clientGroups, clientGroups),
            clientSubgroups: mergeById(
              result.payload.clientSubgroups,
              clientSubgroups,
            ),
            records: mergeById(result.payload.records, records),
            payments: mergeById(result.payload.payments, payments),
            costs: mergeById(result.payload.costs, costs),
            dailyExpenses: mergeById(
              result.payload.dailyExpenses,
              dailyExpenses,
            ),
            customerInfos: mergeById(
              result.payload.customerInfos,
              customerInfos,
            ),
            permissionGroups: mergeById(
              result.payload.permissionGroups,
              permissionGroups,
            ),
            auditLogs: mergeById(result.payload.auditLogs, auditLogs),
            users: mergeById(result.payload.users, users),
          };
          skipServerSync.current = false;
          applyServerData(mergedPayload);
          notify("检测到其他用户已更新数据，已合并本次回款修改");
        } else if (response.ok) {
          serverVersion.current = result.version ?? serverVersion.current;
        }
      } catch {
        // Local storage remains available while the API is offline.
      } finally {
        serverSyncInFlight.current = false;
        if (serverSyncQueued.current) {
          serverSyncQueued.current = false;
          setServerSyncPulse((current) => current + 1);
        }
      }
    }, 450);
    return () => {
      if (serverSyncTimer.current) window.clearTimeout(serverSyncTimer.current);
    };
  }, [
    serverHydrated,
    serverSyncPulse,
    clients,
    clientGroups,
    clientSubgroups,
    records,
    payments,
    costs,
    dailyExpenses,
    customerInfos,
    permissionGroups,
    feeTypes,
    employees,
    costTypes,
    dailyExpenseTypes,
    reimbursers,
    suppliers,
    supplierDetails,
    emailSchedule,
    auditLogs,
    users,
    regionCatalog,
  ]);

  useEffect(() => {
    if (!serverHydrated) return;
    const poll = window.setInterval(async () => {
      if (serverSyncInFlight.current) return;
      try {
        const response = await apiFetch("/api/state", {
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;
        const remote = (await response.json()) as {
          version: number;
          payload: StoredData | null;
        };
        if (
          remote.payload &&
          serverVersion.current !== null &&
          remote.version !== serverVersion.current
        ) {
          serverVersion.current = remote.version;
          skipServerSync.current = true;
          applyServerData(remote.payload);
          notify("数据已同步到其他用户的最新修改");
        }
      } catch {
        // The local fallback continues to work while the API is offline.
      }
    }, 15000);
    return () => window.clearInterval(poll);
  }, [serverHydrated]);

  useEffect(() => {
    try {
      const data: StoredData = {
        clients,
        clientGroups,
        clientSubgroups,
        records,
        payments,
        costs,
        dailyExpenses,
        customerInfos,
        permissionGroups,
        feeTypes,
        employees,
        costTypes,
        dailyExpenseTypes,
        reimbursers,
        suppliers,
        supplierDetails,
        emailSchedule,
        auditLogs,
        users,
        regionCatalog,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage can be unavailable in private browsing or when quota is exceeded.
    }
  }, [
    clients,
    clientGroups,
    clientSubgroups,
    records,
    payments,
    costs,
    dailyExpenses,
    customerInfos,
    permissionGroups,
    feeTypes,
    employees,
    costTypes,
    dailyExpenseTypes,
    reimbursers,
    suppliers,
    supplierDetails,
    emailSchedule,
    auditLogs,
    users,
    regionCatalog,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        REGION_CATALOG_STORAGE_KEY,
        JSON.stringify(regionCatalog),
      );
    } catch {
      // Region categories remain available for the current session when storage is unavailable.
    }
  }, [regionCatalog]);

  useEffect(() => {
    setClients((current) => {
      const migrated = current.map((client) =>
        migrateClientLocation(client, clientGroups, clientSubgroups),
      );
      return migrated.some(
        (client, index) =>
          JSON.stringify(client) !== JSON.stringify(current[index]),
      )
        ? migrated
        : current;
    });
  }, [clientGroups, clientSubgroups]);

  useEffect(() => {
    setDirectoryCollapsedGroups((current) => [
      ...new Set([...current, ...clientGroups.map((group) => group.id)]),
    ]);
  }, [clientGroups]);

  useEffect(() => {
    setDirectoryCollapsedSubgroups((current) => [
      ...new Set([
        ...current,
        ...clientSubgroups.map((subgroup) => subgroup.id),
      ]),
    ]);
  }, [clientSubgroups]);

  useEffect(() => {
    if (!serverHydrated) return;
    if (!session) {
      void apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      window.localStorage.removeItem(SESSION_ACTIVITY_STORAGE_KEY);
      return;
    }
    const currentUser = users.find((user) => user.id === session.id);
    if (!currentUser || currentUser.status === "停用") {
      setSession(null);
      return;
    }
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(currentUser),
    );
    if (!window.localStorage.getItem(SESSION_ACTIVITY_STORAGE_KEY))
      window.localStorage.setItem(
        SESSION_ACTIVITY_STORAGE_KEY,
        String(Date.now()),
      );
    // State hydration creates fresh user objects on every response. Compare the
    // user data instead of object identity so hydration does not restart in a
    // loop and prevent local edits from reaching the server.
    if (JSON.stringify(currentUser) !== JSON.stringify(session))
      setSession(currentUser);
  }, [session, users, serverHydrated]);

  useEffect(() => {
    if (!session) return;
    let lastRecordedActivity =
      Number(window.localStorage.getItem(SESSION_ACTIVITY_STORAGE_KEY)) ||
      Date.now();
    let idleTimer: number | null = null;
    const logoutForIdle = () => {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      window.localStorage.removeItem(SESSION_ACTIVITY_STORAGE_KEY);
      logout();
      notify("登录已超时，请重新登录");
    };
    const scheduleLogout = () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      const elapsed = Date.now() - lastRecordedActivity;
      if (elapsed >= SESSION_IDLE_TIMEOUT_MS) logoutForIdle();
      else
        idleTimer = window.setTimeout(
          logoutForIdle,
          SESSION_IDLE_TIMEOUT_MS - elapsed,
        );
    };
    const recordActivity = () => {
      const now = Date.now();
      if (now - lastRecordedActivity < 1000) return;
      lastRecordedActivity = now;
      window.localStorage.setItem(SESSION_ACTIVITY_STORAGE_KEY, String(now));
      scheduleLogout();
    };
    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
      "mousemove",
    ];
    activityEvents.forEach((event) =>
      window.addEventListener(event, recordActivity, { passive: true }),
    );
    const syncActivity = () => {
      const storedActivity = Number(
        window.localStorage.getItem(SESSION_ACTIVITY_STORAGE_KEY),
      );
      if (
        Number.isFinite(storedActivity) &&
        storedActivity > lastRecordedActivity
      ) {
        lastRecordedActivity = storedActivity;
        scheduleLogout();
      }
    };
    window.addEventListener("storage", syncActivity);
    scheduleLogout();
    return () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      activityEvents.forEach((event) =>
        window.removeEventListener(event, recordActivity),
      );
      window.removeEventListener("storage", syncActivity);
    };
  }, [session?.id]);

  useEffect(() => {
    if (session?.mustChangePassword) setPasswordModal(true);
  }, [session?.id, session?.mustChangePassword]);

  useEffect(() => {
    if (userModal === "new") setMustChangeOnFirstLogin(true);
  }, [userModal]);

  useEffect(() => {
    setAuditPage((current) =>
      Math.min(
        current,
        Math.max(1, Math.ceil(auditLogs.length / auditPageSize)),
      ),
    );
  }, [auditLogs.length, auditPageSize]);

  useEffect(() => {
    setRecentClientsPage((current) =>
      Math.min(current, recentClientsPageCount),
    );
  }, [recentClientsPageCount]);

  useEffect(() => {
    setRemindersPage((current) => Math.min(current, remindersPageCount));
  }, [remindersPageCount]);

  useEffect(() => {
    setClientPage(1);
  }, [search, regionFilters, clientPageSize]);

  useEffect(() => {
    setClientPage((current) => Math.min(current, clientPageCount));
  }, [clientPageCount]);

  useEffect(() => {
    setDetailFeePage(1);
    setDetailPaymentPage(1);
    setDetailCostPage(1);
    setDetailInfoPage(1);
  }, [selected?.id]);

  useEffect(() => {
    setDetailFeePage((current) => Math.min(current, detailFeePageCount));
  }, [detailFeePageCount]);
  useEffect(() => {
    setDetailPaymentPage((current) =>
      Math.min(current, detailPaymentPageCount),
    );
  }, [detailPaymentPageCount]);
  useEffect(() => {
    setDetailCostPage(1);
  }, [costRecordSelection]);
  useEffect(() => {
    setDetailCostPage((current) => Math.min(current, detailCostPageCount));
  }, [detailCostPageCount]);
  useEffect(() => {
    setDetailInfoPage((current) => Math.min(current, detailInfoPageCount));
  }, [detailInfoPageCount]);

  useEffect(() => {
    if (
      (recordTab === "fee" && !canViewFee) ||
      (recordTab === "payment" && !canViewPayment) ||
      (recordTab === "info" && !canViewInfo)
    )
      setRecordTab(preferredRecordTab);
  }, [recordTab, canViewFee, canViewPayment, canViewInfo, preferredRecordTab]);

  useEffect(() => {
    if (!session) return;
    const canStay =
      active === "dashboard"
        ? canViewDashboard
        : active === "clients"
          ? canViewClients
          : active === "companyExpenses"
            ? canViewCompanyExpenses
            : active === "dailyExpenses"
              ? canViewDailyExpenses
              : canViewUsers;
    if (!canStay)
      setActive(
        canViewDashboard
          ? "dashboard"
          : canViewClients
            ? "clients"
            : canViewCompanyExpenses
              ? "companyExpenses"
              : canViewDailyExpenses
                ? "dailyExpenses"
                : "users",
      );
  }, [
    session?.id,
    session?.permissionGroupId,
    permissionGroups,
    active,
    canViewDashboard,
    canViewClients,
    canViewCompanyExpenses,
    canViewDailyExpenses,
    canViewUsers,
  ]);

  useEffect(() => {
    if (!session) return;
    setClientsExpanded(false);
    setCompanyExpensesExpanded(false);
  }, [session?.id]);

  // 认证恢复完成后重置导航折叠状态，避免刷新时沿用旧页面状态。
  useEffect(() => {
    if (!authChecking && session) {
      setClientsExpanded(false);
      setCompanyExpensesExpanded(false);
    }
  }, [authChecking, session?.id]);

  useEffect(() => {
    if (!paymentModal || !formPayment.docId) return;
    const record = selectedRecords.find(
      (item) => item.docId === formPayment.docId,
    );
    if (record && !formPayment.expectedPaymentDate) {
      setFormPayment((current) => ({
        ...current,
        expectedPaymentDate: record.paymentDate || "",
      }));
    }
  }, [
    paymentModal,
    formPayment.docId,
    selectedRecords,
    formPayment.expectedPaymentDate,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        NAVIGATION_STORAGE_KEY,
        JSON.stringify({ active, selectedId, recordTab }),
      );
    } catch {
      // Navigation restoration is optional when browser storage is unavailable.
    }
  }, [active, selectedId, recordTab]);

  useEffect(() => {
    if (
      active !== "clients" ||
      clientsExpanded !== previousClientsExpanded.current
    )
      setSelectedId("");
    if (!clientsExpanded) {
      setExpandedGroups([]);
      setExpandedSubgroups([]);
    }
    previousClientsExpanded.current = clientsExpanded;
  }, [active, clientsExpanded]);

  useEffect(() => {
    if (!supplierModalOpen) return;
    const details = editingSupplier
      ? supplierDetails[editingSupplier]
      : undefined;
    setSupplierContact(details?.contact || "");
    setSupplierPhone(details?.phone || "");
  }, [supplierModalOpen, editingSupplier, supplierDetails]);

  useEffect(() => {
    const title = document.querySelector(".topbar h2");
    if (active === "clients" && title)
      title.textContent = selected ? "客户详情" : "客户列表";
    if (active === "users" && title) title.textContent = "权限管理";
    if (active === "companyExpenses" && title)
      title.textContent = "公司费用管理";
    if (active === "dailyExpenses" && title) title.textContent = "日常费用管理";
  }, [active, selected]);

  useEffect(() => {
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>(".app-sidebar .nav-group"),
    );
    const companyGroup = groups.find((group) =>
      group
        .querySelector(":scope > button")
        ?.textContent?.includes("公司费用管理"),
    );
    const parent =
      companyGroup?.querySelector<HTMLButtonElement>(":scope > button");
    const subNav =
      companyGroup?.querySelector<HTMLElement>(":scope > .sub-nav");
    if (!companyGroup || !parent || !subNav) return;
    const hasCompanyNavigation = canViewCompanyExpenses || canViewDailyExpenses;
    companyGroup.style.display = hasCompanyNavigation ? "" : "none";
    subNav.style.display =
      companyExpensesExpanded && canViewDailyExpenses ? "" : "none";
    parent.setAttribute("aria-expanded", String(companyExpensesExpanded));
  }, [companyExpensesExpanded, canViewCompanyExpenses, canViewDailyExpenses]);

  useEffect(() => {
    const permissionClasses = [
      "no-permission-dashboard",
      "no-permission-clients",
      "no-permission-users",
      "no-permission-fee",
      "no-permission-payment",
      "no-permission-cost",
      "no-permission-info",
    ];
    permissionClasses.forEach((className) =>
      document.body.classList.remove(className),
    );
    if (session) {
      if (!canViewDashboard)
        document.body.classList.add("no-permission-dashboard");
      if (!canViewClients) document.body.classList.add("no-permission-clients");
      if (!canViewUsers) document.body.classList.add("no-permission-users");
      if (!canViewFee) document.body.classList.add("no-permission-fee");
      if (!canViewPayment) document.body.classList.add("no-permission-payment");
      if (!canViewCost) document.body.classList.add("no-permission-cost");
      if (!canViewInfo) document.body.classList.add("no-permission-info");
    }
    return () =>
      permissionClasses.forEach((className) =>
        document.body.classList.remove(className),
      );
  }, [
    session?.id,
    canViewDashboard,
    canViewClients,
    canViewUsers,
    canViewFee,
    canViewPayment,
    canViewCost,
    canViewInfo,
  ]);

  const auditSearchEntries = useMemo(() => {
    const query = auditSearch.trim().toLocaleLowerCase();
    if (!query) return auditLogs;
    const actionLabels: Record<AuditAction, string> = {
      create: "新增",
      update: "修改",
      delete: "删除",
      security: "安全操作",
      send: "发送",
    };
    return auditLogs.filter((log) =>
      [
        log.createdAt,
        new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false }),
        log.username,
        actionLabels[log.action],
        log.entity,
        log.summary,
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [auditLogs, auditSearch]);
  const auditPageCount = Math.max(
    1,
    Math.ceil(auditSearchEntries.length / auditPageSize),
  );
  const auditPageEntries = auditSearchEntries.slice(
    (auditPage - 1) * auditPageSize,
    auditPage * auditPageSize,
  );
  const auditPageNumbers = Array.from(
    { length: auditPageCount },
    (_, index) => index + 1,
  ).filter(
    (page) =>
      auditPageCount <= 7 ||
      page === 1 ||
      page === auditPageCount ||
      Math.abs(page - auditPage) <= 1,
  );
  useEffect(() => {
    setAuditPage((current) => Math.min(current, auditPageCount));
  }, [auditPageCount]);

  if (authChecking) return null;

  if (!session)
    return (
      <div className="login-page">
        <div className="login-panel">
          <div className="login-brand">
            <div className="brand-mark">
              <CircleDollarSign size={22} />
            </div>
            <div>
              <strong>OA帮</strong>
              <span>费用客户管理系统</span>
            </div>
          </div>
          <div className="login-copy">
            <p className="eyebrow">SECURE WORKSPACE</p>
            <h1>
              让每一笔维护费
              <br />
              <em>清晰可追溯</em>
            </h1>
            <p>集中管理客户、服务周期与收款记录，实时掌握应收余额。</p>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const response = await apiFetch("/api/auth/login", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    identifier: login.identifier,
                    password: login.password,
                  }),
                });
                const result = (await response.json()) as {
                  user?: User;
                  error?: string;
                };
                if (!response.ok || !result.user) {
                  setLoginError("登录信息或密码不正确");
                  return;
                }
                setLoginError("");
                setLogin({ identifier: "", password: "" });
                setActive("dashboard");
                setSelectedId("");
                setClientsExpanded(false);
                setCompanyExpensesExpanded(false);
                setSession(result.user);
              } catch {
                setLoginError("登录服务暂时不可用");
              }
            }}
          >
            <label>
              用户名
              <input
                type="text"
                value={login.identifier}
                placeholder="用户名 / 邮箱 / 手机号"
                autoComplete="username"
                onChange={(e) => {
                  setLogin({ ...login, identifier: e.target.value });
                  setLoginError("");
                }}
              />
            </label>
            <label>
              登录密码
              <div className="login-password-field">
                <input
                  type={loginPasswordVisible ? "text" : "password"}
                  value={login.password}
                  autoComplete="current-password"
                  onChange={(e) => {
                    setLogin({ ...login, password: e.target.value });
                    setLoginError("");
                  }}
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setLoginPasswordVisible((current) => !current)}
                  aria-label={loginPasswordVisible ? "隐藏密码" : "显示密码"}
                  title={loginPasswordVisible ? "隐藏密码" : "显示密码"}
                >
                  {loginPasswordVisible ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>
            </label>
            {loginError && (
              <div className="login-error" role="alert">
                {loginError}
              </div>
            )}
            <button className="primary-btn login-btn">
              <ShieldCheck size={17} />
              进入工作台
            </button>
          </form>
          <div className="login-foot">支持使用用户名、邮箱或手机号登录</div>
        </div>
        <div className="login-aside" aria-hidden="true" />
      </div>
    );

  function openClient(c: Client | "new") {
    if (c === "new" ? !canCreateClient : !canEditClient) {
      notify("当前角色没有此操作权限");
      return;
    }
    const customerTypeId =
      c === "new" ? (clientGroups[0]?.id ?? "") : c.customerTypeId || c.groupId;
    setClientModal(c);
    setFormClient(
      c === "new"
        ? {
            name: "",
            company: "",
            phone: "",
            email: "",
            startDate: "",
            endDate: "",
            province: defaultProvince,
            city: defaultCity,
            district: defaultDistrict,
            customerTypeId,
            groupId: customerTypeId,
            subgroupId: "",
          }
        : {
            name: c.name,
            company: c.company,
            phone: c.phone,
            email: c.email,
            startDate: c.startDate,
            endDate: c.endDate,
            province: c.province || "",
            city: c.city || "",
            district: c.district || "",
            customerTypeId,
            groupId: customerTypeId,
            subgroupId: c.subgroupId || "",
          },
    );
  }
  function saveClient() {
    if (!formClient.name.trim() || !formClient.company.trim()) {
      notify("请填写公司名称和客户姓名");
      return;
    }
    if (!formClient.customerTypeId) {
      notify("请选择客户类型");
      return;
    }
    if (
      formClient.startDate &&
      formClient.endDate &&
      formClient.endDate < formClient.startDate
    ) {
      notify("结束时间不能早于开始时间");
      return;
    }
    const nextClient = {
      ...formClient,
      groupId: formClient.customerTypeId,
      customerTypeId: formClient.customerTypeId,
    };
    if (clientModal === "new") {
      if (!canCreateClient) {
        notify("当前角色没有添加客户权限");
        return;
      }
      const id = "c" + Date.now();
      setClients((current) => [
        { id, ...nextClient, createdAt: new Date().toISOString() },
        ...current,
      ]);
      setSelectedId(id);
      recordAudit("create", "客户", `新增客户：${formClient.company}`, id);
      notify("客户已添加");
    } else if (clientModal) {
      if (!canEditClient) {
        notify("当前角色没有修改客户权限");
        return;
      }
      setClients((current) =>
        current.map((c) =>
          c.id === clientModal.id ? { ...c, ...nextClient } : c,
        ),
      );
      recordAudit(
        "update",
        "客户",
        `修改客户：${formClient.company}`,
        clientModal.id,
      );
      notify("客户资料已更新");
    }
    setClientModal(null);
  }
  function addGroup() {
    if (!canManageClientGroups) {
      notify("当前角色没有分组管理权限");
      return;
    }
    const name = groupName.trim();
    if (!name || clientGroups.some((group) => group.name === name)) return;
    const id = "g" + Date.now();
    setClientGroups((current) =>
      current.some((group) => group.name === name)
        ? current
        : [...current, { id, name }],
    );
    setGroupName("");
    recordAudit("create", "客户分组", `新增分组：${name}`, id);
    notify("客户分组已添加");
  }
  function saveGroupEdit() {
    if (!canManageClientGroups) {
      notify("当前角色没有分组管理权限");
      return;
    }
    const name = groupName.trim();
    if (
      !editingGroupId ||
      !name ||
      clientGroups.some(
        (group) => group.id !== editingGroupId && group.name === name,
      )
    )
      return;
    setClientGroups((current) =>
      current.map((group) =>
        group.id === editingGroupId ? { ...group, name } : group,
      ),
    );
    setGroupName("");
    recordAudit("update", "客户分组", `修改分组：${name}`, editingGroupId);
    setEditingGroupId(null);
    notify("客户分组已更新");
  }
  function openGroupManager() {
    if (!canManageClientGroups) {
      notify("当前角色没有分组管理权限");
      return;
    }
    setEditingGroupId(null);
    setGroupName("");
    setGroupModalOpen(true);
  }
  function moveGroup(id: string, direction: -1 | 1) {
    if (!canManageClientGroups) return;
    setClientGroups((current) => {
      const index = current.findIndex((group) => group.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    recordAudit(
      "update",
      "客户分组",
      `调整分组排序：${clientGroups.find((group) => group.id === id)?.name ?? id}`,
      id,
    );
  }
  function removeGroup(id: string) {
    if (!canManageClientGroups) {
      notify("当前角色没有分组管理权限");
      return;
    }
    if (clients.some((client) => client.groupId === id)) {
      notify("该分组有客户信息，不能删除");
      return;
    }
    if (clientSubgroups.some((subgroup) => subgroup.groupId === id)) {
      notify("该分组有二级分类，不能删除");
      return;
    }
    if (!confirm("确定删除该客户分类吗？")) return;
    const name = clientGroups.find((group) => group.id === id)?.name ?? id;
    setClientGroups((current) => current.filter((group) => group.id !== id));
    if (editingGroupId === id) {
      setEditingGroupId(null);
      setGroupName("");
    }
    recordAudit("delete", "客户分组", `删除分组：${name}`, id);
    notify("客户分组已删除");
  }
  function openSubgroupEditor(groupId: string, subgroup?: ClientSubgroup) {
    setSubgroupParentId(groupId);
    setEditingSubgroupId(subgroup?.id ?? null);
    setSubgroupName(subgroup?.name ?? "");
  }
  function saveSubgroup() {
    if (!canManageClientGroups || !subgroupParentId) {
      notify("当前角色没有分组管理权限");
      return;
    }
    const name = subgroupName.trim();
    if (
      !name ||
      clientSubgroups.some(
        (subgroup) =>
          subgroup.groupId === subgroupParentId &&
          subgroup.id !== editingSubgroupId &&
          subgroup.name === name,
      )
    ) {
      notify("请输入不重复的二级分类名称");
      return;
    }
    if (editingSubgroupId) {
      setClientSubgroups((current) =>
        current.map((subgroup) =>
          subgroup.id === editingSubgroupId ? { ...subgroup, name } : subgroup,
        ),
      );
      recordAudit(
        "update",
        "客户二级分类",
        `修改二级分类：${name}`,
        editingSubgroupId,
      );
      notify("二级分类已更新");
    } else {
      const id = "sg" + Date.now();
      setClientSubgroups((current) => [
        ...current,
        { id, groupId: subgroupParentId, name },
      ]);
      recordAudit("create", "客户二级分类", `新增二级分类：${name}`, id);
      notify("二级分类已添加");
    }
    setSubgroupName("");
    setSubgroupParentId(null);
    setEditingSubgroupId(null);
  }
  function moveSubgroup(id: string, direction: -1 | 1) {
    if (!canManageClientGroups) return;
    setClientSubgroups((current) => {
      const item = current.find((subgroup) => subgroup.id === id);
      if (!item) return current;
      const positions = current
        .map((subgroup, index) =>
          subgroup.groupId === item.groupId ? index : -1,
        )
        .filter((index) => index >= 0);
      const index = positions.findIndex(
        (position) => current[position].id === id,
      );
      const target = index + direction;
      if (index < 0 || target < 0 || target >= positions.length) return current;
      const next = [...current];
      [next[positions[index]], next[positions[target]]] = [
        next[positions[target]],
        next[positions[index]],
      ];
      return next;
    });
    recordAudit(
      "update",
      "客户二级分类",
      `调整二级分类排序：${clientSubgroups.find((item) => item.id === id)?.name ?? id}`,
      id,
    );
  }
  function removeSubgroup(subgroup: ClientSubgroup) {
    if (!canManageClientGroups) {
      notify("当前角色没有分组管理权限");
      return;
    }
    if (clients.some((client) => client.subgroupId === subgroup.id)) {
      notify("该二级分类有客户信息，不能删除");
      return;
    }
    if (!confirm(`确定删除二级分类“${subgroup.name}”吗？`)) return;
    setClientSubgroups((current) =>
      current.filter((item) => item.id !== subgroup.id),
    );
    if (editingSubgroupId === subgroup.id) {
      setSubgroupName("");
      setSubgroupParentId(null);
      setEditingSubgroupId(null);
    }
    recordAudit(
      "delete",
      "客户二级分类",
      `删除二级分类：${subgroup.name}`,
      subgroup.id,
    );
    notify("二级分类已删除");
  }
  async function removeClient(id: string) {
    if (!canDeleteClient) {
      notify("当前角色没有删除客户权限");
      return;
    }
    if (!confirm("确定删除该客户及其费用明细吗？")) return;
    const client = clients.find((item) => item.id === id);
    const related = [
      ...records.filter((r) => r.clientId === id),
      ...payments.filter((p) => p.clientId === id),
      ...costs.filter((c) => c.clientId === id),
    ];
    const attachments = related.flatMap((item) => item.attachments || []);
    setClients((current) => current.filter((c) => c.id !== id));
    setRecords((current) => current.filter((r) => r.clientId !== id));
    setPayments((current) =>
      current.filter((payment) => payment.clientId !== id),
    );
    setCosts((current) => current.filter((cost) => cost.clientId !== id));
    setCustomerInfos((current) =>
      current.filter((info) => info.clientId !== id),
    );
    setSelectedId((current) => (current === id ? "" : current));
    const deletionResults = await Promise.all(
      attachments.map((attachment) =>
        apiFetch(`/api/uploads/${encodeURIComponent(attachment.id)}`, {
          method: "DELETE",
        }).catch(() => null),
      ),
    );
    recordAudit("delete", "客户", `删除客户：${client?.company ?? id}`, id);
    notify(
      deletionResults.some(
        (response) => response && !response.ok && response.status !== 404,
      )
        ? "客户已删除，但部分附件删除失败"
        : "客户已删除",
    );
  }
  const regionLevelLabels: Record<RegionLevel, string> = {
    province: "省份/直辖市",
    city: "地市",
    district: "区/县",
  };
  function openRegionManager(level: RegionLevel) {
    if (!canManageRegionLevel(level)) {
      notify(`当前角色没有${regionLevelLabels[level]}分类管理权限`);
      return;
    }
    const province =
      regionFilters.province || Object.keys(regionCatalog)[0] || "";
    const city =
      regionFilters.city || Object.keys(regionCatalog[province] || {})[0] || "";
    setRegionManager({ level, province, city });
    setRegionName("");
    setEditingRegionName(null);
  }
  function getManagedRegionItems(
    manager: { level: RegionLevel; province: string; city: string } | null,
  ) {
    if (!manager) return [];
    if (manager.level === "province") return Object.keys(regionCatalog);
    if (manager.level === "city")
      return Object.keys(regionCatalog[manager.province] || {});
    return regionCatalog[manager.province]?.[manager.city] || [];
  }
  function updateRegionManagerParent(
    field: "province" | "city",
    value: string,
  ) {
    if (!regionManager) return;
    if (field === "province") {
      setRegionManager({
        ...regionManager,
        province: value,
        city: Object.keys(regionCatalog[value] || {})[0] || "",
      });
    } else {
      setRegionManager({ ...regionManager, city: value });
    }
    setRegionName("");
    setEditingRegionName(null);
  }
  function saveRegionCategory() {
    if (!regionManager || !canManageRegionLevel(regionManager.level)) return;
    const name = regionName.trim();
    if (!name) {
      notify(`请输入${regionLevelLabels[regionManager.level]}名称`);
      return;
    }
    const items = getManagedRegionItems(regionManager);
    if (items.some((item) => item !== editingRegionName && item === name)) {
      notify("分类名称已存在");
      return;
    }
    const oldName = editingRegionName;
    setRegionCatalog((current) => {
      const next = JSON.parse(JSON.stringify(current)) as RegionCatalog;
      if (regionManager.level === "province") {
        if (oldName) {
          next[name] = next[oldName] || {};
          delete next[oldName];
        } else next[name] = {};
      } else if (regionManager.level === "city") {
        next[regionManager.province] = {
          ...(next[regionManager.province] || {}),
        };
        if (oldName) {
          next[regionManager.province][name] =
            next[regionManager.province][oldName] || [];
          delete next[regionManager.province][oldName];
        } else next[regionManager.province][name] = [];
      } else {
        next[regionManager.province] = {
          ...(next[regionManager.province] || {}),
        };
        next[regionManager.province][regionManager.city] = [
          ...(next[regionManager.province][regionManager.city] || []),
        ];
        if (oldName)
          next[regionManager.province][regionManager.city] = next[
            regionManager.province
          ][regionManager.city].map((item) => (item === oldName ? name : item));
        else next[regionManager.province][regionManager.city].push(name);
      }
      return next;
    });
    if (oldName) {
      const managedProvince = regionManager.province;
      const managedCity = regionManager.city;
      setClients((current) =>
        current.map((client) => {
          const matches =
            regionManager.level === "province"
              ? client.province === oldName
              : regionManager.level === "city"
                ? client.province === managedProvince && client.city === oldName
                : client.province === managedProvince &&
                  client.city === managedCity &&
                  client.district === oldName;
          return matches
            ? {
                ...client,
                ...(regionManager.level === "province"
                  ? { province: name }
                  : regionManager.level === "city"
                    ? { city: name }
                    : { district: name }),
              }
            : client;
        }),
      );
      setRegionFilters((current) => ({
        ...current,
        ...(regionManager.level === "province" && current.province === oldName
          ? { province: name, city: "", district: "" }
          : {}),
        ...(regionManager.level === "city" &&
        current.province === managedProvince &&
        current.city === oldName
          ? { city: name, district: "" }
          : {}),
        ...(regionManager.level === "district" &&
        current.province === managedProvince &&
        current.city === managedCity &&
        current.district === oldName
          ? { district: name }
          : {}),
      }));
      setRegionManager((current) => {
        if (!current) return current;
        if (
          regionManager.level === "city" &&
          current.level === "city" &&
          current.province === managedProvince &&
          current.city === oldName
        )
          return { ...current, city: name };
        if (
          regionManager.level === "province" &&
          current.level === "province" &&
          current.province === oldName
        )
          return { ...current, province: name };
        return current;
      });
      notify(`${regionLevelLabels[regionManager.level]}已修改`);
    } else notify(`${regionLevelLabels[regionManager.level]}已添加`);
    setRegionName("");
    setEditingRegionName(null);
  }
  function removeRegionCategory(name: string) {
    if (!regionManager || !canManageRegionLevel(regionManager.level)) return;
    const inUse = clients.some((client) =>
      regionManager.level === "province"
        ? client.province === name
        : regionManager.level === "city"
          ? client.province === regionManager.province && client.city === name
          : client.province === regionManager.province &&
            client.city === regionManager.city &&
            client.district === name,
    );
    if (inUse) {
      notify("该地区分类已有客户使用，不能删除");
      return;
    }
    if (
      !confirm(`确定删除${regionLevelLabels[regionManager.level]}“${name}”吗？`)
    )
      return;
    setRegionCatalog((current) => {
      const next = JSON.parse(JSON.stringify(current)) as RegionCatalog;
      if (regionManager.level === "province") delete next[name];
      else if (regionManager.level === "city") {
        if (next[regionManager.province])
          delete next[regionManager.province][name];
      } else if (next[regionManager.province]?.[regionManager.city])
        next[regionManager.province][regionManager.city] = next[
          regionManager.province
        ][regionManager.city].filter((item) => item !== name);
      return next;
    });
    if (editingRegionName === name) {
      setEditingRegionName(null);
      setRegionName("");
    }
    notify(`${regionLevelLabels[regionManager.level]}已删除`);
  }
  function openRecord(record: RecordItem | "new") {
    attachmentUploadGeneration.current += 1;
    recordNewUploadIds.current.clear();
    if (record === "new") {
      setFormRecord({
        start: selected?.startDate ?? "",
        end: selected?.endDate ?? "",
        recordDate: toLocalDateTimeInputValue().slice(0, 10),
        fee: "0",
        paid: "0",
        paymentDate: toLocalDateTimeInputValue().slice(0, 10),
        method: "",
        feeType: "",
        employee: "",
        projectName: "",
        note: "",
      });
      setSavedAttachments([]);
    } else {
      setFormRecord({
        start: record.start,
        end: record.end,
        recordDate: record.recordDate || record.start,
        fee: String(record.fee),
        paid: String(record.paid),
        paymentDate: record.paymentDate,
        method: record.method,
        feeType: record.feeType || feeTypes[0] || "",
        employee: record.employee || employees[0] || "",
        projectName: record.projectName || "",
        note: record.note,
      });
      setSavedAttachments(normalizeAttachments(record.attachments));
    }
    setPendingAttachments([]);
    setAttachmentsToDelete([]);
    setRecordModal(record);
  }
  function closeRecordModal() {
    attachmentUploadGeneration.current += 1;
    pendingAttachments.forEach((attachment) =>
      URL.revokeObjectURL(attachment.previewUrl),
    );
    void Promise.all(
      [...recordNewUploadIds.current].map((id) =>
        apiFetch(`/api/uploads/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }).catch(() => null),
      ),
    );
    recordNewUploadIds.current.clear();
    setPendingAttachments([]);
    setSavedAttachments([]);
    setAttachmentsToDelete([]);
    setRecordModal(null);
  }
  function collectPendingAttachments(
    event: React.ChangeEvent<HTMLInputElement>,
    existingAttachments: Array<Attachment | PendingAttachment>,
  ) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return [];
    const unsupported = files.find((file) => !isSupportedAttachment(file));
    if (unsupported) {
      notify(
        `不支持上传 ${unsupported.name}，请选择图片、PDF、Word、Excel 或文本文件`,
      );
      return [];
    }
    const oversized = files.find((file) => file.size > MAX_ATTACHMENT_SIZE);
    if (oversized) {
      notify(`附件 ${oversized.name} 超过 100 MB，无法上传`);
      return [];
    }
    const totalSize =
      existingAttachments.reduce(
        (total, attachment) => total + attachment.size,
        0,
      ) + files.reduce((total, file) => total + file.size, 0);
    if (totalSize > MAX_ATTACHMENTS_TOTAL_SIZE) {
      notify("单条记录的附件总大小不能超过 200 MB");
      return [];
    }
    return files.map((file, index) => ({
      id: `pending-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
      progress: 0,
      status: "uploading" as const,
    }));
  }
  function uploadSelectedAttachments(
    attachments: PendingAttachment[],
    setPending: React.Dispatch<React.SetStateAction<PendingAttachment[]>>,
    setSaved: React.Dispatch<React.SetStateAction<Attachment[]>>,
    newUploadIds: React.MutableRefObject<Set<string>>,
  ) {
    const generation = attachmentUploadGeneration.current;
    void Promise.all(
      attachments.map(async (pending) => {
        try {
          const uploaded = await uploadAttachment(pending.file, (progress) =>
            setPending((current) =>
              current.map((item) =>
                item.id === pending.id ? { ...item, progress } : item,
              ),
            ),
          );
          if (generation !== attachmentUploadGeneration.current) {
            await apiFetch(`/api/uploads/${encodeURIComponent(uploaded.id)}`, {
              method: "DELETE",
            }).catch(() => null);
            URL.revokeObjectURL(pending.previewUrl);
            return;
          }
          newUploadIds.current.add(uploaded.id);
          URL.revokeObjectURL(pending.previewUrl);
          setPending((current) =>
            current.filter((item) => item.id !== pending.id),
          );
          setSaved((current) => [...current, uploaded]);
        } catch (error) {
          setPending((current) =>
            current.map((item) =>
              item.id === pending.id
                ? {
                    ...item,
                    status: "error",
                    error: error instanceof Error ? error.message : "上传失败",
                  }
                : item,
            ),
          );
        }
      }),
    );
  }
  function handleRecordAttachments(event: React.ChangeEvent<HTMLInputElement>) {
    const attachments = collectPendingAttachments(event, [
      ...savedAttachments,
      ...pendingAttachments,
    ]);
    if (attachments.length) {
      setPendingAttachments((current) => [...current, ...attachments]);
      uploadSelectedAttachments(
        attachments,
        setPendingAttachments,
        setSavedAttachments,
        recordNewUploadIds,
      );
    }
  }
  function removePendingAttachment(id: string) {
    setPendingAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      if (removed?.uploadedId)
        void apiFetch(
          `/api/uploads/${encodeURIComponent(removed.uploadedId)}`,
          { method: "DELETE" },
        ).catch(() => null);
      return current.filter((attachment) => attachment.id !== id);
    });
  }
  function removeSavedAttachment(attachment: Attachment) {
    setSavedAttachments((current) =>
      current.filter((item) => item.id !== attachment.id),
    );
    setAttachmentsToDelete((current) =>
      current.some((item) => item.id === attachment.id)
        ? current
        : [...current, attachment],
    );
  }
  async function saveRecord() {
    const fee = Number(formRecord.fee) || 0,
      paid = Number(formRecord.paid) || 0;
    // Date inputs can update their DOM value before React receives the change event.
    // Read the live values at submit time so edits are never lost.
    const recordDate = String(
      recordDateInput.current
        ? recordDateInput.current.value
        : formRecord.recordDate || "",
    ).trim();
    const paymentDate = String(
      recordPaymentDateInput.current
        ? recordPaymentDateInput.current.value
        : formRecord.paymentDate || "",
    ).trim();
    if (!selected) {
      notify("请先选择客户");
      return;
    }
    if (!fee || fee <= 0) {
      notify("请输入大于 0 的费用金额");
      return;
    }
    if (!recordDate) {
      notify("请选择开始时间");
      return;
    }
    if (formRecord.end && formRecord.end < recordDate) {
      notify("结束时间不能早于开始时间");
      return;
    }
    if (!formRecord.employee) {
      notify("请选择业务经理");
      return;
    }
    if (!formRecord.feeType) {
      notify("请选择费用类型");
      return;
    }
    if (!formRecord.method) {
      notify("请选择支付方式");
      return;
    }
    if (pendingAttachments.length) {
      notify("请等待附件上传完成");
      return;
    }
    if (!savedAttachments.length) {
      notify("请先添加至少一个附件作为费用凭证");
      return;
    }
    setRecordSaving(true);
    try {
      const attachments = [...savedAttachments];
      const details = {
        start: recordDate,
        end: formRecord.end || recordDate,
        recordDate,
        fee,
        paid,
        paymentDate,
        method: formRecord.method,
        feeType: formRecord.feeType,
        employee: formRecord.employee,
        projectName: formRecord.projectName.trim(),
        note: formRecord.note.trim(),
        attachments,
      };
      if (recordModal === "new") {
        const id = "r" + Date.now();
        const docId = makeDocId(recordDate, records);
        setRecords((current) => [
          { id, docId, clientId: selected.id, ...details },
          ...current,
        ]);
        recordAudit(
          "create",
          "费用明细",
          `新增费用明细：${selected.company}，单据ID ${docId}，${money(fee)}`,
          id,
        );
        notify("费用明细已添加");
      } else if (recordModal) {
        setRecords((current) =>
          current.map((record) =>
            record.id === recordModal.id ? { ...record, ...details } : record,
          ),
        );
        recordAudit(
          "update",
          "费用明细",
          `修改费用明细：${selected.company}，单据ID ${recordModal.docId}`,
          recordModal.id,
        );
        notify("费用明细已更新");
      }
      const deletionResults = await Promise.all(
        attachmentsToDelete.map((attachment) =>
          apiFetch(`/api/uploads/${encodeURIComponent(attachment.id)}`, {
            method: "DELETE",
          }).catch(() => null),
        ),
      );
      if (
        deletionResults.some(
          (response) => response && !response.ok && response.status !== 404,
        )
      )
        notify("费用明细已保存，但部分旧附件删除失败");
      recordNewUploadIds.current.clear();
      closeRecordModal();
    } catch {
      notify("附件上传失败，请检查文件后重试");
    } finally {
      setRecordSaving(false);
    }
  }
  function openPaymentModal(docId?: string) {
    attachmentUploadGeneration.current += 1;
    paymentNewUploadIds.current.clear();
    setEditingPaymentId(null);
    const unpaidRecord = docId
      ? selectedRecords.find(
          (record) => record.docId === docId && record.fee > paidFor(record),
        )
      : selectedRecords.find((record) => record.fee > paidFor(record));
    setFormPayment({
      docId: unpaidRecord?.docId ?? "",
      paymentDate: toLocalDateTimeInputValue().slice(0, 10),
      expectedPaymentDate: unpaidRecord?.paymentDate ?? "",
      method: "",
      amount: "",
      note: "",
    });
    setPendingPaymentAttachments([]);
    setSavedPaymentAttachments([]);
    setPaymentAttachmentsToDelete([]);
    setPaymentModal(true);
  }
  function openPaymentEdit(payment: PaymentItem) {
    attachmentUploadGeneration.current += 1;
    paymentNewUploadIds.current.clear();
    setEditingPaymentId(payment.id);
    const linkedRecord = selectedRecords.find(
      (record) => record.docId === payment.docId,
    );
    setFormPayment({
      docId: payment.docId,
      paymentDate: payment.paymentDate,
      expectedPaymentDate:
        payment.expectedPaymentDate || linkedRecord?.paymentDate || "",
      method: payment.method,
      amount: String(payment.amount),
      note: payment.note,
    });
    setPendingPaymentAttachments([]);
    setSavedPaymentAttachments(
      Array.isArray(payment.attachments) ? payment.attachments : [],
    );
    setPaymentAttachmentsToDelete([]);
    setPaymentModal(true);
  }
  function closePaymentModal() {
    attachmentUploadGeneration.current += 1;
    pendingPaymentAttachments.forEach((attachment) =>
      URL.revokeObjectURL(attachment.previewUrl),
    );
    void Promise.all(
      [...paymentNewUploadIds.current].map((id) =>
        apiFetch(`/api/uploads/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }).catch(() => null),
      ),
    );
    paymentNewUploadIds.current.clear();
    setPendingPaymentAttachments([]);
    setSavedPaymentAttachments([]);
    setPaymentAttachmentsToDelete([]);
    setPaymentModal(false);
    setEditingPaymentId(null);
  }
  function handlePaymentAttachments(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const attachments = collectPendingAttachments(event, [
      ...savedPaymentAttachments,
      ...pendingPaymentAttachments,
    ]);
    if (attachments.length) {
      setPendingPaymentAttachments((current) => [...current, ...attachments]);
      uploadSelectedAttachments(
        attachments,
        setPendingPaymentAttachments,
        setSavedPaymentAttachments,
        paymentNewUploadIds,
      );
    }
  }
  function removePendingPaymentAttachment(id: string) {
    setPendingPaymentAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      if (removed?.uploadedId)
        void apiFetch(
          `/api/uploads/${encodeURIComponent(removed.uploadedId)}`,
          { method: "DELETE" },
        ).catch(() => null);
      return current.filter((attachment) => attachment.id !== id);
    });
  }
  function removeSavedPaymentAttachment(attachment: Attachment) {
    setSavedPaymentAttachments((current) =>
      current.filter((item) => item.id !== attachment.id),
    );
    setPaymentAttachmentsToDelete((current) =>
      current.some((item) => item.id === attachment.id)
        ? current
        : [...current, attachment],
    );
  }
  async function savePayment() {
    const record = selectedRecords.find(
      (item) => item.docId === formPayment.docId,
    );
    const amount = Number(formPayment.amount) || 0;
    const missing: string[] = [];
    if (!record) {
      notify("请选择欠款单据");
      return;
    }
    const clientId = selected?.id;
    const clientCompany = selected?.company ?? "";
    if (!clientId) {
      notify("请先选择客户");
      return;
    }
    if (!formPayment.paymentDate) missing.push("收款时间");
    if (!formPayment.expectedPaymentDate) missing.push("预计支付时间");
    if (!formPayment.method) missing.push("收款方式");
    if (!amount) missing.push("收款金额");
    if (!formPayment.note.trim()) missing.push("备注信息");
    if (missing.length) {
      notify(`请填写：${missing.join("、")}`);
      return;
    }
    if (pendingPaymentAttachments.length) {
      notify("请等待附件上传完成");
      return;
    }
    if (!savedPaymentAttachments.length) {
      notify("请先添加至少一个附件作为回款凭证");
      return;
    }
    const editingPayment = editingPaymentId
      ? payments.find((payment) => payment.id === editingPaymentId)
      : undefined;
    const remaining =
      record.fee -
      (paidFor(record) -
        (editingPayment?.docId === record.docId ? editingPayment.amount : 0));
    if (amount > remaining) {
      notify(`回款金额不能超过欠款 ${money(remaining)}`);
      return;
    }
    setPaymentSaving(true);
    try {
      const attachments = [...savedPaymentAttachments];
      setRecords((current) =>
        current.map((item) =>
          item.docId === formPayment.docId
            ? { ...item, paymentDate: formPayment.expectedPaymentDate }
            : item,
        ),
      );
      if (editingPaymentId) {
        setPayments((current) =>
          current.map((payment) =>
            payment.id === editingPaymentId
              ? {
                  ...payment,
                  ...formPayment,
                  note: formPayment.note.trim(),
                  amount,
                  attachments,
                }
              : payment,
          ),
        );
        recordAudit(
          "update",
          "回款明细",
          `修改回款：${clientCompany}，单据ID ${formPayment.docId}，${money(amount)}`,
          editingPaymentId,
        );
        notify("回款明细已更新");
      } else {
        const id = "p" + Date.now();
        setPayments((current) => [
          {
            ...formPayment,
            id,
            clientId,
            docId: record.docId,
            note: formPayment.note.trim(),
            amount,
            attachments,
          },
          ...current,
        ]);
        recordAudit(
          "create",
          "回款明细",
          `新增回款：${clientCompany}，单据ID ${formPayment.docId}，${money(amount)}`,
          id,
        );
        notify("回款已添加");
      }
      await Promise.all(
        paymentAttachmentsToDelete.map((attachment) =>
          apiFetch(`/api/uploads/${encodeURIComponent(attachment.id)}`, {
            method: "DELETE",
          }).catch(() => null),
        ),
      );
      // Keep the current customer visible and show the newly-created payment immediately.
      // The state sync effect persists the same update to the local API afterwards.
      setSelectedId(clientId);
      setActive("clients");
      setRecordTab("payment");
      paymentNewUploadIds.current.clear();
      closePaymentModal();
    } catch {
      notify("附件上传失败，请检查文件后重试");
    } finally {
      setPaymentSaving(false);
    }
  }
  async function removePayment(id: string) {
    if (!confirm("确定删除这条回款明细吗？")) return;
    const payment = payments.find((item) => item.id === id);
    setPayments((current) => current.filter((payment) => payment.id !== id));
    const deletionResults = await Promise.all(
      (payment?.attachments || []).map((attachment) =>
        apiFetch(`/api/uploads/${encodeURIComponent(attachment.id)}`, {
          method: "DELETE",
        }).catch(() => null),
      ),
    );
    recordAudit(
      "delete",
      "回款明细",
      `删除回款：${selected?.company ?? ""}，单据ID ${payment?.docId ?? id}`,
      id,
    );
    notify(
      deletionResults.some(
        (response) => response && !response.ok && response.status !== 404,
      )
        ? "回款明细已删除，但部分附件删除失败"
        : "回款明细已删除",
    );
  }
  function openCostModal(cost: CostItem | "new", docId?: string) {
    attachmentUploadGeneration.current += 1;
    costNewUploadIds.current.clear();
    setSupplierSearch("");
    if (cost === "new") {
      setFormCost({
        docId:
          docId ??
          selectedCostRecords[0]?.docId ??
          selectedRecords[0]?.docId ??
          "",
        supplier: suppliers[0] ?? "",
        reimburser: reimbursers[0] ?? "",
        costType: costTypes[0] ?? "",
        amount: "",
        note: "",
        createdAt: toLocalDateTimeInputValue().slice(0, 10),
      });
      setSavedCostAttachments([]);
    } else {
      const record = selectedRecords.find((item) => item.docId === cost.docId);
      setFormCost({
        docId: cost.docId,
        supplier: cost.supplier || suppliers[0] || "",
        reimburser: cost.reimburser || reimbursers[0] || "",
        costType: cost.costType || cost.feeTypes?.[0] || costTypes[0] || "",
        amount: String(cost.amount),
        note: cost.note,
        createdAt: toLocalDateTimeInputValue(cost.createdAt).slice(0, 10),
      });
      setSavedCostAttachments(
        Array.isArray(cost.attachments) ? cost.attachments : [],
      );
    }
    setPendingCostAttachments([]);
    setCostAttachmentsToDelete([]);
    setCostModal(cost);
  }
  function closeCostModal() {
    attachmentUploadGeneration.current += 1;
    pendingCostAttachments.forEach((attachment) =>
      URL.revokeObjectURL(attachment.previewUrl),
    );
    void Promise.all(
      [...costNewUploadIds.current].map((id) =>
        apiFetch(`/api/uploads/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }).catch(() => null),
      ),
    );
    costNewUploadIds.current.clear();
    setPendingCostAttachments([]);
    setSavedCostAttachments([]);
    setCostAttachmentsToDelete([]);
    setCostModal(null);
  }
  function handleCostAttachments(event: React.ChangeEvent<HTMLInputElement>) {
    const attachments = collectPendingAttachments(event, [
      ...savedCostAttachments,
      ...pendingCostAttachments,
    ]);
    if (attachments.length) {
      setPendingCostAttachments((current) => [...current, ...attachments]);
      uploadSelectedAttachments(
        attachments,
        setPendingCostAttachments,
        setSavedCostAttachments,
        costNewUploadIds,
      );
    }
  }
  function removePendingCostAttachment(id: string) {
    setPendingCostAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      if (removed?.uploadedId)
        void apiFetch(
          `/api/uploads/${encodeURIComponent(removed.uploadedId)}`,
          { method: "DELETE" },
        ).catch(() => null);
      return current.filter((attachment) => attachment.id !== id);
    });
  }
  function removeSavedCostAttachment(attachment: Attachment) {
    setSavedCostAttachments((current) =>
      current.filter((item) => item.id !== attachment.id),
    );
    setCostAttachmentsToDelete((current) =>
      current.some((item) => item.id === attachment.id)
        ? current
        : [...current, attachment],
    );
  }
  async function saveCost() {
    const amount = Number(formCost.amount) || 0;
    const record = selectedRecords.find(
      (item) => item.docId === formCost.docId,
    );
    if (
      !selected ||
      !record ||
      !formCost.supplier ||
      !formCost.reimburser ||
      !formCost.costType ||
      amount <= 0 ||
      !formCost.note.trim()
    ) {
      notify("请选择费用单据、供应商、报销人、费用类型并完整填写成本和备注");
      return;
    }
    if (pendingCostAttachments.length) {
      notify("请等待附件上传完成");
      return;
    }
    if (!savedCostAttachments.length) {
      notify("请先添加至少一个附件作为成本凭证");
      return;
    }
    setCostSaving(true);
    try {
      const attachments = [...savedCostAttachments];
      const createdAt = new Date(formCost.createdAt);
      const details = {
        docId: record.docId,
        clientId: selected.id,
        supplier: formCost.supplier,
        reimburser: formCost.reimburser,
        costType: formCost.costType,
        amount,
        note: formCost.note.trim(),
        createdAt: Number.isNaN(createdAt.getTime())
          ? new Date().toISOString()
          : createdAt.toISOString(),
        attachments,
      };
      if (costModal === "new") {
        const id = "co" + Date.now();
        setCosts((current) => [{ id, ...details }, ...current]);
        recordAudit(
          "create",
          "成本明细",
          `新增成本：${selected.company}，单据ID ${record.docId}，${money(amount)}`,
          id,
        );
        notify("成本已添加");
      } else if (costModal) {
        setCosts((current) =>
          current.map((cost) =>
            cost.id === costModal.id ? { ...cost, ...details } : cost,
          ),
        );
        recordAudit(
          "update",
          "成本明细",
          `修改成本：${selected.company}，单据ID ${record.docId}，${money(amount)}`,
          costModal.id,
        );
        notify("成本明细已更新");
      }
      await Promise.all(
        costAttachmentsToDelete.map((attachment) =>
          apiFetch(`/api/uploads/${encodeURIComponent(attachment.id)}`, {
            method: "DELETE",
          }).catch(() => null),
        ),
      );
      costNewUploadIds.current.clear();
      closeCostModal();
    } catch {
      notify("附件上传失败，请检查文件后重试");
    } finally {
      setCostSaving(false);
    }
  }
  async function removeCost(id: string) {
    if (!canDeleteCost) {
      notify("当前角色没有删除成本费用权限");
      return;
    }
    if (!confirm("确定删除这条成本明细吗？")) return;
    const cost = costs.find((item) => item.id === id);
    setCosts((current) => current.filter((item) => item.id !== id));
    const deletionResults = await Promise.all(
      (cost?.attachments || []).map((attachment) =>
        apiFetch(`/api/uploads/${encodeURIComponent(attachment.id)}`, {
          method: "DELETE",
        }).catch(() => null),
      ),
    );
    recordAudit(
      "delete",
      "成本明细",
      `删除成本：${selected?.company ?? ""}，单据ID ${cost?.docId ?? id}`,
      id,
    );
    notify(
      deletionResults.some(
        (response) => response && !response.ok && response.status !== 404,
      )
        ? "成本明细已删除，但部分附件删除失败"
        : "成本明细已删除",
    );
  }
  function openDailyExpenseModal(expense: DailyExpense | "new") {
    attachmentUploadGeneration.current += 1;
    dailyExpenseNewUploadIds.current.clear();
    if (expense === "new" ? !canCreateDailyExpense : !canEditDailyExpense) {
      notify(
        expense === "new"
          ? "当前角色没有添加日常费用权限"
          : "当前角色没有修改日常费用权限",
      );
      return;
    }
    if (expense === "new") {
      setFormDailyExpense({
        recordDate: toLocalDateTimeInputValue().slice(0, 10),
        expenseType: dailyExpenseTypes[0] || "",
        reimburser: reimbursers[0] || "",
        amount: "",
        note: "",
      });
      setSavedDailyExpenseAttachments([]);
    } else {
      setFormDailyExpense({
        recordDate: expense.recordDate,
        expenseType: expense.expenseType,
        reimburser: expense.reimburser,
        amount: String(expense.amount),
        note: expense.note,
      });
      setSavedDailyExpenseAttachments(
        Array.isArray(expense.attachments) ? expense.attachments : [],
      );
    }
    setPendingDailyExpenseAttachments([]);
    setDailyExpenseAttachmentsToDelete([]);
    setDailyExpenseModal(expense);
  }
  function closeDailyExpenseModal() {
    attachmentUploadGeneration.current += 1;
    pendingDailyExpenseAttachments.forEach((attachment) =>
      URL.revokeObjectURL(attachment.previewUrl),
    );
    void Promise.all(
      [...dailyExpenseNewUploadIds.current].map((id) =>
        apiFetch(`/api/uploads/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }).catch(() => null),
      ),
    );
    dailyExpenseNewUploadIds.current.clear();
    setPendingDailyExpenseAttachments([]);
    setSavedDailyExpenseAttachments([]);
    setDailyExpenseAttachmentsToDelete([]);
    setDailyExpenseModal(null);
  }
  function handleDailyExpenseAttachments(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const attachments = collectPendingAttachments(event, [
      ...savedDailyExpenseAttachments,
      ...pendingDailyExpenseAttachments,
    ]);
    if (attachments.length) {
      setPendingDailyExpenseAttachments((current) => [
        ...current,
        ...attachments,
      ]);
      uploadSelectedAttachments(
        attachments,
        setPendingDailyExpenseAttachments,
        setSavedDailyExpenseAttachments,
        dailyExpenseNewUploadIds,
      );
    }
  }
  function removePendingDailyExpenseAttachment(id: string) {
    setPendingDailyExpenseAttachments((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      if (removed?.uploadedId)
        void apiFetch(
          `/api/uploads/${encodeURIComponent(removed.uploadedId)}`,
          { method: "DELETE" },
        ).catch(() => null);
      return current.filter((item) => item.id !== id);
    });
  }
  function removeSavedDailyExpenseAttachment(attachment: Attachment) {
    setSavedDailyExpenseAttachments((current) =>
      current.filter((item) => item.id !== attachment.id),
    );
    setDailyExpenseAttachmentsToDelete((current) =>
      current.some((item) => item.id === attachment.id)
        ? current
        : [...current, attachment],
    );
  }
  async function saveDailyExpense() {
    if (
      dailyExpenseModal === "new"
        ? !canCreateDailyExpense
        : !canEditDailyExpense
    ) {
      notify(
        dailyExpenseModal === "new"
          ? "当前角色没有添加日常费用权限"
          : "当前角色没有修改日常费用权限",
      );
      return;
    }
    const amount = Number(formDailyExpense.amount) || 0;
    if (!formDailyExpense.recordDate) {
      notify("请选择费用日期");
      return;
    }
    if (!formDailyExpense.expenseType) {
      notify("请选择费用类型");
      return;
    }
    if (!formDailyExpense.reimburser) {
      notify("请选择报销人");
      return;
    }
    if (amount <= 0) {
      notify("请输入大于 0 的费用金额");
      return;
    }
    if (pendingDailyExpenseAttachments.length) {
      notify("请等待附件上传完成");
      return;
    }
    if (!savedDailyExpenseAttachments.length) {
      notify("请先添加至少一个附件作为费用凭证");
      return;
    }
    setDailyExpenseSaving(true);
    try {
      const attachments = [...savedDailyExpenseAttachments];
      const details = {
        recordDate: formDailyExpense.recordDate,
        expenseType: formDailyExpense.expenseType,
        reimburser: formDailyExpense.reimburser,
        amount,
        note: formDailyExpense.note.trim(),
        attachments,
      };
      if (dailyExpenseModal === "new") {
        const id = "de" + Date.now();
        const docId = makeDailyExpenseDocId(
          formDailyExpense.recordDate,
          dailyExpenses,
        );
        setDailyExpenses((current) => [{ id, docId, ...details }, ...current]);
        recordAudit(
          "create",
          "日常费用",
          `新增日常费用：${docId}，${money(amount)}`,
          id,
        );
        notify("日常费用已添加");
      } else if (dailyExpenseModal) {
        setDailyExpenses((current) =>
          current.map((item) =>
            item.id === dailyExpenseModal.id ? { ...item, ...details } : item,
          ),
        );
        recordAudit(
          "update",
          "日常费用",
          `修改日常费用：${dailyExpenseModal.docId}，${money(amount)}`,
          dailyExpenseModal.id,
        );
        notify("日常费用已更新");
      }
      await Promise.all(
        dailyExpenseAttachmentsToDelete.map((attachment) =>
          apiFetch(`/api/uploads/${encodeURIComponent(attachment.id)}`, {
            method: "DELETE",
          }).catch(() => null),
        ),
      );
      dailyExpenseNewUploadIds.current.clear();
      closeDailyExpenseModal();
    } catch {
      notify("附件上传失败，请检查文件后重试");
    } finally {
      setDailyExpenseSaving(false);
    }
  }
  async function removeDailyExpense(id: string) {
    if (!canDeleteDailyExpense) {
      notify("当前角色没有删除日常费用权限");
      return;
    }
    if (!confirm("确定删除这条日常费用吗？")) return;
    const expense = dailyExpenses.find((item) => item.id === id);
    setDailyExpenses((current) => current.filter((item) => item.id !== id));
    const deletionResults = await Promise.all(
      (expense?.attachments || []).map((attachment) =>
        apiFetch(`/api/uploads/${encodeURIComponent(attachment.id)}`, {
          method: "DELETE",
        }).catch(() => null),
      ),
    );
    recordAudit(
      "delete",
      "日常费用",
      `删除日常费用：${expense?.docId ?? id}`,
      id,
    );
    notify(
      deletionResults.some(
        (response) => response && !response.ok && response.status !== 404,
      )
        ? "日常费用已删除，但部分附件删除失败"
        : "日常费用已删除",
    );
  }
  function saveDailyExpenseListValue(kind: "type" | "reimburser") {
    if (
      kind === "type"
        ? !canManageDailyExpenseTypes
        : !canManageActiveReimbursers
    ) {
      notify(
        kind === "type"
          ? "当前角色没有费用类型管理权限"
          : "当前角色没有报销人管理权限",
      );
      return;
    }
    const isType = kind === "type";
    const value = (isType ? dailyExpenseTypeName : reimburserName).trim();
    const items = isType ? dailyExpenseTypes : reimbursers;
    const editing = isType ? editingDailyExpenseType : editingReimburser;
    if (!value || items.some((item) => item === value && item !== editing)) {
      notify("请输入不重复的名称");
      return;
    }
    if (editing) {
      const setter = isType ? setDailyExpenseTypes : setReimbursers;
      setter((current) =>
        sortTextValues(
          current.map((item) => (item === editing ? value : item)),
        ),
      );
      recordAudit(
        "update",
        isType ? "日常费用类型" : "报销人",
        `修改${isType ? "费用类型" : "报销人"}：${editing} -> ${value}`,
        editing,
      );
    } else {
      const setter = isType ? setDailyExpenseTypes : setReimbursers;
      setter((current) => sortTextValues([...current, value]));
      recordAudit(
        "create",
        isType ? "日常费用类型" : "报销人",
        `新增${isType ? "费用类型" : "报销人"}：${value}`,
        value,
      );
    }
    if (isType) {
      setDailyExpenseTypeName("");
      setEditingDailyExpenseType(null);
    } else {
      setReimburserName("");
      setEditingReimburser(null);
    }
  }
  function removeDailyExpenseListValue(
    kind: "type" | "reimburser",
    value: string,
  ) {
    if (
      kind === "type"
        ? !canManageDailyExpenseTypes
        : !canManageActiveReimbursers
    ) {
      notify(
        kind === "type"
          ? "当前角色没有费用类型管理权限"
          : "当前角色没有报销人管理权限",
      );
      return;
    }
    const isType = kind === "type";
    const used = dailyExpenses.some(
      (item) => (isType ? item.expenseType : item.reimburser) === value,
    );
    if (used) {
      notify("该分类已有日常费用记录，不能删除");
      return;
    }
    if (!confirm(`确定删除“${value}”吗？`)) return;
    (isType ? setDailyExpenseTypes : setReimbursers)((current) =>
      current.filter((item) => item !== value),
    );
    recordAudit(
      "delete",
      isType ? "日常费用类型" : "报销人",
      `删除${isType ? "费用类型" : "报销人"}：${value}`,
      value,
    );
  }
  function closeDailyExpenseTypeManager() {
    setDailyExpenseTypeManagerOpen(false);
    setEditingDailyExpenseType(null);
    setDailyExpenseTypeName("");
  }
  function closeReimburserManager() {
    setReimburserManagerOpen(false);
    setEditingReimburser(null);
    setReimburserName("");
  }
  function openCustomerInfoModal() {
    setEditingCustomerInfoId(null);
    setFormCustomerInfo({ name: "", note: "" });
    setCustomerInfoModal(true);
  }
  function openCustomerInfoEdit(info: CustomerInfo) {
    setEditingCustomerInfoId(info.id);
    setFormCustomerInfo({ name: info.name, note: info.note });
    setCustomerInfoModal(true);
  }
  function saveCustomerInfo() {
    if (!selected || !formCustomerInfo.name.trim()) {
      notify("请填写运维资料名称");
      return;
    }
    const details = {
      name: formCustomerInfo.name.trim(),
      note: formCustomerInfo.note.trim(),
    };
    if (editingCustomerInfoId) {
      setCustomerInfos((current) =>
        current.map((info) =>
          info.id === editingCustomerInfoId ? { ...info, ...details } : info,
        ),
      );
      recordAudit(
        "update",
        "运维资料",
        `修改运维资料：${selected.company}，${details.name}`,
        editingCustomerInfoId,
      );
      notify("运维资料已更新");
    } else {
      const id = "ci" + Date.now();
      setCustomerInfos((current) => [
        { id, clientId: selected.id, ...details },
        ...current,
      ]);
      recordAudit(
        "create",
        "运维资料",
        `新增运维资料：${selected.company}，${details.name}`,
        id,
      );
      notify("运维资料已添加");
    }
    setCustomerInfoModal(false);
    setEditingCustomerInfoId(null);
  }
  function removeCustomerInfo(id: string) {
    if (!confirm("确定删除这条运维资料吗？")) return;
    const info = customerInfos.find((item) => item.id === id);
    setCustomerInfos((current) => current.filter((info) => info.id !== id));
    recordAudit(
      "delete",
      "运维资料",
      `删除运维资料：${selected?.company ?? ""}，${info?.name ?? id}`,
      id,
    );
    notify("运维资料已删除");
  }
  async function removeRecord(id: string) {
    if (!canDeleteFee) {
      notify("当前角色没有删除记录权限");
      return;
    }
    const record = records.find((item) => item.id === id);
    if (!confirm("确定删除这条费用明细吗？")) return;
    const relatedCosts = record?.docId
      ? costs.filter((cost) => cost.docId === record.docId)
      : [];
    const relatedPayments = record?.docId
      ? payments.filter((payment) => payment.docId === record.docId)
      : [];
    setRecords((current) => current.filter((r) => r.id !== id));
    if (record?.docId)
      setCosts((current) =>
        current.filter((cost) => cost.docId !== record.docId),
      );
    if (record?.docId)
      setPayments((current) =>
        current.filter((payment) => payment.docId !== record.docId),
      );
    const attachments = [
      ...(record?.attachments || []),
      ...relatedCosts.flatMap((cost) => cost.attachments || []),
      ...relatedPayments.flatMap((payment) => payment.attachments || []),
    ];
    const deletionResults = await Promise.all(
      attachments.map((attachment) =>
        fetch(`/api/uploads/${encodeURIComponent(attachment.id)}`, {
          method: "DELETE",
        }).catch(() => null),
      ),
    );
    recordAudit(
      "delete",
      "费用明细",
      `删除费用明细：${selected?.company ?? ""}，单据ID ${record?.docId ?? id}`,
      id,
    );
    notify(
      deletionResults.some(
        (response) => response && !response.ok && response.status !== 404,
      )
        ? "记录已删除，但部分附件删除失败"
        : "记录已删除",
    );
  }
  function addFeeType() {
    if (!canManageFeeTypes) {
      notify("当前角色没有费用类型管理权限");
      return;
    }
    const name = feeTypeName.trim();
    if (!name || feeTypes.includes(name)) return;
    const id = `fee-type-${Date.now()}`;
    setFeeTypes((current) =>
      current.includes(name) ? current : [...current, name],
    );
    setFeeTypeName("");
    recordAudit("create", "费用类型", `新增费用类型：${name}`, id);
    notify("费用类型已添加");
  }
  function saveFeeTypeEdit() {
    if (!canManageFeeTypes) {
      notify("当前角色没有费用类型管理权限");
      return;
    }
    const name = feeTypeName.trim();
    if (
      !editingFeeType ||
      !name ||
      (feeTypes.includes(name) && name !== editingFeeType)
    )
      return;
    setFeeTypes((current) =>
      current.map((type) => (type === editingFeeType ? name : type)),
    );
    setRecords((current) =>
      current.map((record) =>
        record.feeType === editingFeeType
          ? { ...record, feeType: name }
          : record,
      ),
    );
    recordAudit(
      "update",
      "费用类型",
      `修改费用类型：${editingFeeType} -> ${name}`,
      editingFeeType,
    );
    setFeeTypeName("");
    setEditingFeeType(null);
    notify("费用类型已更新");
  }
  function removeFeeType(type: string) {
    if (!canManageFeeTypes) {
      notify("当前角色没有费用类型管理权限");
      return;
    }
    if (records.some((record) => record.feeType === type)) {
      notify("该费用类型已有记录，不能删除");
      return;
    }
    if (!confirm("确定删除该费用类型吗？")) return;
    setFeeTypes((current) => current.filter((item) => item !== type));
    if (editingFeeType === type) {
      setEditingFeeType(null);
      setFeeTypeName("");
    }
    recordAudit("delete", "费用类型", `删除费用类型：${type}`, type);
    notify("费用类型已删除");
  }
  function addEmployee() {
    if (!canManageEmployees) {
      notify("当前角色没有员工管理权限");
      return;
    }
    const name = employeeName.trim();
    if (!name || employees.includes(name)) return;
    const id = `employee-${Date.now()}`;
    setEmployees((current) => sortTextValues([...current, name]));
    setEmployeeName("");
    recordAudit("create", "员工", `新增员工：${name}`, id);
    notify("员工已添加");
  }
  function saveEmployeeEdit() {
    if (!canManageEmployees) {
      notify("当前角色没有员工管理权限");
      return;
    }
    const name = employeeName.trim();
    if (
      !editingEmployee ||
      !name ||
      (employees.includes(name) && name !== editingEmployee)
    )
      return;
    setEmployees((current) =>
      sortTextValues(
        current.map((employee) =>
          employee === editingEmployee ? name : employee,
        ),
      ),
    );
    setRecords((current) =>
      current.map((record) =>
        record.employee === editingEmployee
          ? { ...record, employee: name }
          : record,
      ),
    );
    recordAudit(
      "update",
      "员工",
      `修改员工：${editingEmployee} -> ${name}`,
      editingEmployee,
    );
    setEmployeeName("");
    setEditingEmployee(null);
    notify("员工已更新");
  }
  function removeEmployee(employee: string) {
    if (!canManageEmployees) {
      notify("当前角色没有员工管理权限");
      return;
    }
    if (records.some((record) => record.employee === employee)) {
      notify("该员工已有费用明细，不能删除");
      return;
    }
    if (!confirm("确定删除该员工吗？")) return;
    setEmployees((current) => current.filter((item) => item !== employee));
    if (editingEmployee === employee) {
      setEditingEmployee(null);
      setEmployeeName("");
    }
    recordAudit("delete", "员工", `删除员工：${employee}`, employee);
    notify("员工已删除");
  }
  function addCostType() {
    if (!canManageCostTypes) {
      notify("当前角色没有成本明细费用类型管理权限");
      return;
    }
    const name = costTypeName.trim();
    if (!name || costTypes.includes(name)) return;
    const id = `cost-type-${Date.now()}`;
    setCostTypes((current) => [...current, name]);
    setCostTypeName("");
    recordAudit("create", "成本明细费用类型", `新增费用类型：${name}`, id);
    notify("成本明细费用类型已添加");
  }
  function saveCostTypeEdit() {
    if (!canManageCostTypes) {
      notify("当前角色没有成本明细费用类型管理权限");
      return;
    }
    const name = costTypeName.trim();
    if (
      !editingCostType ||
      !name ||
      (costTypes.includes(name) && name !== editingCostType)
    )
      return;
    setCostTypes((current) =>
      current.map((type) => (type === editingCostType ? name : type)),
    );
    setCosts((current) =>
      current.map((cost) =>
        cost.costType === editingCostType ? { ...cost, costType: name } : cost,
      ),
    );
    recordAudit(
      "update",
      "利润分析表费用类型",
      `修改费用类型：${editingCostType} -> ${name}`,
      editingCostType,
    );
    setCostTypeName("");
    setEditingCostType(null);
    notify("成本明细费用类型已更新");
  }
  function removeCostType(type: string) {
    if (!canManageCostTypes) {
      notify("当前角色没有成本明细费用类型管理权限");
      return;
    }
    if (costs.some((cost) => cost.costType === type)) {
      notify("该费用类型已有利润分析记录，不能删除");
      return;
    }
    if (!confirm("确定删除该成本明细费用类型吗？")) return;
    setCostTypes((current) => current.filter((item) => item !== type));
    if (editingCostType === type) {
      setEditingCostType(null);
      setCostTypeName("");
    }
    recordAudit("delete", "成本明细费用类型", `删除费用类型：${type}`, type);
    notify("成本明细费用类型已删除");
  }
  function addSupplier() {
    if (!canManageCostSuppliers) {
      notify("当前角色没有供应商管理权限");
      return;
    }
    const name = supplierName.trim();
    if (!name || suppliers.includes(name)) return;
    const id = `supplier-${Date.now()}`;
    setSuppliers((current) => sortTextValues([...current, name]));
    setSupplierDetails((current) => ({
      ...current,
      [name]: { contact: supplierContact.trim(), phone: supplierPhone.trim() },
    }));
    setSupplierName("");
    setSupplierContact("");
    setSupplierPhone("");
    recordAudit("create", "供应商", `新增供应商：${name}`, id);
    notify("供应商已添加");
  }
  function saveSupplierEdit() {
    if (!canManageCostSuppliers) {
      notify("当前角色没有供应商管理权限");
      return;
    }
    const name = supplierName.trim();
    if (
      !editingSupplier ||
      !name ||
      (suppliers.includes(name) && name !== editingSupplier)
    )
      return;
    setSuppliers((current) =>
      sortTextValues(
        current.map((item) => (item === editingSupplier ? name : item)),
      ),
    );
    setCosts((current) =>
      current.map((cost) =>
        cost.supplier === editingSupplier ? { ...cost, supplier: name } : cost,
      ),
    );
    setSupplierDetails((current) => {
      const next = { ...current };
      delete next[editingSupplier];
      next[name] = {
        contact: supplierContact.trim(),
        phone: supplierPhone.trim(),
      };
      return next;
    });
    recordAudit(
      "update",
      "供应商",
      `修改供应商：${editingSupplier} -> ${name}`,
      editingSupplier,
    );
    setSupplierName("");
    setSupplierContact("");
    setSupplierPhone("");
    setEditingSupplier(null);
    notify("供应商已更新");
  }
  function removeSupplier(name: string) {
    if (!canManageCostSuppliers) {
      notify("当前角色没有供应商管理权限");
      return;
    }
    if (costs.some((cost) => cost.supplier === name)) {
      notify("该供应商已有成本明细，不能删除");
      return;
    }
    if (!confirm(`确定删除供应商“${name}”吗？`)) return;
    setSuppliers((current) => current.filter((item) => item !== name));
    setSupplierDetails((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    if (editingSupplier === name) {
      setEditingSupplier(null);
      setSupplierName("");
      setSupplierContact("");
      setSupplierPhone("");
    }
    recordAudit("delete", "供应商", `删除供应商：${name}`, name);
    notify("供应商已删除");
  }
  function moveFeeType(type: string, direction: -1 | 1) {
    if (!canManageFeeTypes) {
      notify("当前角色没有费用类型管理权限");
      return;
    }
    const index = feeTypes.indexOf(type);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= feeTypes.length) return;
    const next = [...feeTypes];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setFeeTypes(next);
    recordAudit("update", "费用类型", `调整费用类型顺序：${type}`);
  }
  function addPermissionGroup() {
    const name = permissionGroupName.trim();
    if (!name || permissionGroups.some((group) => group.name === name)) {
      notify("请输入不重复的角色名称");
      return;
    }
    const id = "pg" + Date.now();
    setPermissionGroups((current) => [
      ...current,
      { id, name, permissions: permissionGroupPermissions },
    ]);
    recordAudit("create", "角色", `新增角色：${name}`, id);
    setPermissionGroupName("");
    setPermissionGroupPermissions(allPermissions.map((item) => item.key));
    notify("角色已添加");
  }
  function openPermissionGroupEdit(group: PermissionGroup) {
    setEditingPermissionGroupId(group.id);
    setPermissionGroupName(group.name);
    setPermissionGroupPermissions(group.permissions);
  }
  function savePermissionGroupEdit() {
    const name = permissionGroupName.trim();
    if (
      !editingPermissionGroupId ||
      !name ||
      permissionGroups.some(
        (group) => group.id !== editingPermissionGroupId && group.name === name,
      )
    ) {
      notify("请输入不重复的角色名称");
      return;
    }
    setPermissionSaveConfirmOpen(true);
  }
  function completePermissionGroupModal() {
    if (editingPermissionGroupId) {
      savePermissionGroupEdit();
      return;
    }
    setPermissionGroupModal(false);
    setPermissionGroupName("");
  }
  function confirmPermissionGroupSave() {
    const name = permissionGroupName.trim();
    if (!editingPermissionGroupId || !name) {
      setPermissionSaveConfirmOpen(false);
      return;
    }
    setPermissionGroups((current) =>
      current.map((group) =>
        group.id === editingPermissionGroupId
          ? { ...group, name, permissions: permissionGroupPermissions }
          : group,
      ),
    );
    recordAudit(
      "update",
      "角色",
      `修改角色权限：${name}`,
      editingPermissionGroupId,
    );
    setPermissionGroupName("");
    setEditingPermissionGroupId(null);
    setPermissionGroupPermissions(allPermissions.map((item) => item.key));
    setPermissionSaveConfirmOpen(false);
    setPermissionGroupModal(false);
    notify("角色已更新");
  }
  function removePermissionGroup(id: string) {
    if (users.some((user) => user.permissionGroupId === id)) {
      notify("该角色已有成员，不能删除");
      return;
    }
    if (!confirm("确定删除该角色吗？")) return;
    const group = permissionGroups.find((item) => item.id === id);
    setPermissionGroups((current) =>
      current.filter((group) => group.id !== id),
    );
    recordAudit("delete", "角色", `删除角色：${group?.name ?? id}`, id);
    notify("角色已删除");
  }
  function openUserEdit(user: User) {
    setFormUser({
      name: user.name,
      username: user.username || "",
      email: user.email,
      phone: user.phone || "",
      password: "",
      role: user.role,
    });
    setUserModal(user);
  }
  function saveUser() {
    if (
      !formUser.name.trim() ||
      !formUser.username.trim() ||
      !formUser.email.trim() ||
      !formUser.phone.trim()
    ) {
      notify("请完整填写成员信息");
      return;
    }
    if (userModal === "new" && !formUser.password) {
      notify("请设置成员初始密码");
      return;
    }
    if (formUser.password && !isPasswordValid(formUser.password)) {
      notify("密码至少8位，且需包含四类字符中的至少三类");
      return;
    }
    const roleGroupId = permissionGroups.find(
      (group) => group.name === formUser.role,
    )?.id;
    if (userModal === "new") {
      const id = "u" + Date.now();
      setUsers((current) => [
        {
          id,
          ...formUser,
          mustChangePassword: mustChangeOnFirstLogin,
          permissionGroupId: roleGroupId,
          status: "正常",
        },
        ...current,
      ]);
      recordAudit(
        "create",
        "成员",
        `新增成员：${formUser.name}（${formUser.username}）`,
        id,
      );
      notify("成员已添加");
    } else if (userModal) {
      setUsers((current) =>
        current.map((user) =>
          user.id === userModal.id
            ? {
                ...user,
                ...formUser,
                mustChangePassword: formUser.password
                  ? true
                  : user.mustChangePassword,
                permissionGroupId: roleGroupId ?? user.permissionGroupId,
              }
            : user,
        ),
      );
      recordAudit(
        "update",
        "成员",
        `修改成员：${formUser.name}（${formUser.username}）`,
        userModal.id,
      );
      notify("成员资料已更新");
    }
    setUserModal(null);
    setFormUser({
      name: "",
      username: "",
      email: "",
      phone: "",
      password: "",
      role: "财务",
    });
  }
  function saveOwnPassword() {
    if (!isPasswordValid(newPassword)) {
      notify("密码至少8位，且需包含大写、小写、数字、特殊符号中的至少三类");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("两次输入的密码不一致");
      return;
    }
    if (!session) return;
    void apiFetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    })
      .then(async (response) => {
        if (!response.ok) {
          notify("密码更新失败，请稍后重试");
          return;
        }
        const result = (await response.json()) as { user?: User };
        if (result.user) {
          setUsers((current) =>
            current.map((user) =>
              user.id === result.user?.id ? (result.user as User) : user,
            ),
          );
          setSession(result.user);
        }
        recordAudit("security", "密码", "用户修改了自己的登录密码", session.id);
        setPasswordModal(false);
        setNewPassword("");
        setConfirmPassword("");
        notify("密码已更新");
      })
      .catch(() => notify("密码服务暂时不可用"));
  }
  function resetUserPassword(user: User) {
    if (session?.role !== "管理员") return;
    const password = window.prompt(
      `请输入${user.name}的新密码（至少8位，含三类字符）`,
      "TempA1!change",
    );
    if (!password) return;
    if (!isPasswordValid(password)) {
      notify("密码至少8位，且需包含三类字符");
      return;
    }
    void apiFetch(`/api/users/${encodeURIComponent(user.id)}/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    })
      .then(async (response) => {
        if (!response.ok) {
          notify("密码重置失败");
          return;
        }
        const result = (await response.json()) as { user?: User };
        if (result.user)
          setUsers((current) =>
            current.map((item) =>
              item.id === result.user?.id ? (result.user as User) : item,
            ),
          );
        recordAudit(
          "security",
          "密码",
          `管理员重置成员密码：${user.name}`,
          user.id,
        );
        notify("密码已重置，用户下次登录需修改密码");
      })
      .catch(() => notify("密码服务暂时不可用"));
  }
  function toggleUserStatus(user: User) {
    if (session?.role !== "管理员") return;
    const nextStatus = user.status === "正常" ? "停用" : "正常";
    setUsers((current) =>
      current.map((item) =>
        item.id === user.id ? { ...item, status: nextStatus } : item,
      ),
    );
    recordAudit(
      "update",
      "成员",
      `${nextStatus === "正常" ? "启用" : "停用"}成员：${user.name}`,
      user.id,
    );
  }
  function removeUser(user: User) {
    if (session?.role !== "管理员" || user.id === session.id) return;
    if (!confirm(`确定删除成员“${user.name}”吗？`)) return;
    setUsers((current) => current.filter((item) => item.id !== user.id));
    recordAudit(
      "delete",
      "成员",
      `删除成员：${user.name}（${user.username || "未设置用户名"}）`,
      user.id,
    );
    notify("成员已删除");
  }
  function renderClientGroup(group: ClientGroup) {
    const groupClients = filteredClients.filter(
      (client) => client.groupId === group.id,
    );
    const subgroups = clientSubgroups.filter(
      (subgroup) => subgroup.groupId === group.id,
    );
    const expanded = searchActive || expandedGroups.includes(group.id);
    const renderClient = (client: Client) => (
      <button
        className={
          "sub-client " +
          (selected?.id === client.id && active === "clients" ? "active" : "")
        }
        key={client.id}
        onClick={() => {
          setSelectedId(client.id);
          setActive("clients");
          setMobileNavOpen(false);
        }}
      >
        <span>
          <strong>{client.company}</strong>
        </span>
      </button>
    );
    return (
      <div className="client-group" key={group.id}>
        <button
          className="group-label"
          onClick={() => {
            setExpandedGroups((current) =>
              expanded
                ? current.filter((id) => id !== group.id)
                : [...current, group.id],
            );
            if (expanded)
              setExpandedSubgroups((current) =>
                current.filter(
                  (id) => !subgroups.some((subgroup) => subgroup.id === id),
                ),
              );
          }}
          aria-expanded={expanded}
        >
          {group.name}
          <span>{groupClients.length}</span>
        </button>
        {expanded &&
          (subgroups.length
            ? subgroups.map((subgroup) => {
                const subgroupClients = sortClientsByNameLength(
                  groupClients.filter(
                    (client) => client.subgroupId === subgroup.id,
                  ),
                );
                const subgroupExpanded =
                  searchActive || expandedSubgroups.includes(subgroup.id);
                return (
                  <div className="sub-client-group" key={subgroup.id}>
                    <button
                      className="sub-client-group-label"
                      onClick={() =>
                        setExpandedSubgroups((current) =>
                          subgroupExpanded
                            ? current.filter((id) => id !== subgroup.id)
                            : [...current, subgroup.id],
                        )
                      }
                      aria-expanded={subgroupExpanded}
                    >
                      {subgroup.name}
                      <span>{subgroupClients.length}</span>
                    </button>
                    {subgroupExpanded && subgroupClients.map(renderClient)}
                  </div>
                );
              })
            : sortClientsByNameLength(groupClients).map(renderClient))}
      </div>
    );
  }
  function renderNestedRegionDirectory() {
    const typeId = (client: Client) => client.customerTypeId || client.groupId;
    const toggle = (key: string) =>
      setExpandedRegionLevels((current) =>
        current.includes(key)
          ? current.filter((item) => item !== key)
          : [...current, key],
      );
    const expanded = (key: string) =>
      searchActive || expandedRegionLevels.includes(key);
    const levelButton = (
      key: string,
      label: string,
      count: number,
      className: string,
    ) => (
      <button
        className={className}
        onClick={() => toggle(key)}
        aria-expanded={expanded(key)}
      >
        <span className="directory-collapse-icon">
          <ChevronDown size={14} />
        </span>
        <strong>{label}</strong>
        <span>{count} 位客户</span>
      </button>
    );
    const provinces = [
      ...new Set(
        filteredClients.map((client) => client.province || "未设置省份"),
      ),
    ].sort((a, b) => a.localeCompare(b, "zh-CN"));
    return (
      <div className="client-directory region-directory panel">
        <div className="directory-head">
          <div>
            <h3>客户目录</h3>
            <span>省份/直辖市 → 地市 → 区/县 → 客户类型 → 客户名称</span>
          </div>
          <span>{filteredClients.length} 位客户</span>
        </div>
        <div className="region-tree">
          {provinces.map((province) => {
            const provinceClients = filteredClients.filter(
              (client) => (client.province || "未设置省份") === province,
            );
            const provinceKey = `province:${province}`;
            return (
              <section className="directory-region-level" key={provinceKey}>
                {levelButton(
                  provinceKey,
                  province,
                  provinceClients.length,
                  "directory-group-head",
                )}
                {expanded(provinceKey) && (
                  <div className="region-tree-children">
                    {[
                      ...new Set(
                        provinceClients.map(
                          (client) => client.city || "未设置地市",
                        ),
                      ),
                    ]
                      .sort((a, b) => a.localeCompare(b, "zh-CN"))
                      .map((city) => {
                        const cityClients = provinceClients.filter(
                          (client) => (client.city || "未设置地市") === city,
                        );
                        const cityKey = `${provinceKey}/city:${city}`;
                        return (
                          <div className="directory-city-level" key={cityKey}>
                            {levelButton(
                              cityKey,
                              city,
                              cityClients.length,
                              "directory-subgroup-head",
                            )}
                            {expanded(cityKey) && (
                              <div className="region-tree-children">
                                {[
                                  ...new Set(
                                    cityClients.map(
                                      (client) =>
                                        client.district || "未设置区县",
                                    ),
                                  ),
                                ]
                                  .sort((a, b) => a.localeCompare(b, "zh-CN"))
                                  .map((district) => {
                                    const districtClients = cityClients.filter(
                                      (client) =>
                                        (client.district || "未设置区县") ===
                                        district,
                                    );
                                    const districtKey = `${cityKey}/district:${district}`;
                                    return (
                                      <div
                                        className="directory-district-level"
                                        key={districtKey}
                                      >
                                        {levelButton(
                                          districtKey,
                                          district,
                                          districtClients.length,
                                          "directory-subgroup-head",
                                        )}
                                        {expanded(districtKey) && (
                                          <div className="region-tree-children region-type-children">
                                            {clientGroups.map((type) => {
                                              const typeClients =
                                                sortClientsByNameLength(
                                                  districtClients.filter(
                                                    (client) =>
                                                      typeId(client) ===
                                                      type.id,
                                                  ),
                                                );
                                              if (!typeClients.length)
                                                return null;
                                              const typeKey = `${districtKey}/type:${type.id}`;
                                              return (
                                                <div
                                                  className="directory-type-level"
                                                  key={typeKey}
                                                >
                                                  {levelButton(
                                                    typeKey,
                                                    type.name,
                                                    typeClients.length,
                                                    "directory-type-head",
                                                  )}
                                                  {expanded(typeKey) && (
                                                    <div className="directory-client-grid">
                                                      {typeClients.map(
                                                        (client) => (
                                                          <div
                                                            className="directory-client"
                                                            key={client.id}
                                                          >
                                                            <button
                                                              className="directory-client-main"
                                                              onClick={() => {
                                                                setSelectedId(
                                                                  client.id,
                                                                );
                                                                setActive(
                                                                  "clients",
                                                                );
                                                              }}
                                                            >
                                                              <span className="client-avatar">
                                                                {client.name.slice(
                                                                  0,
                                                                  1,
                                                                )}
                                                              </span>
                                                              <span>
                                                                <strong>
                                                                  {
                                                                    client.company
                                                                  }
                                                                </strong>
                                                                <small>
                                                                  {client.name}{" "}
                                                                  ·{" "}
                                                                  {client.phone ||
                                                                    "未设置电话"}
                                                                </small>
                                                              </span>
                                                            </button>
                                                            <div className="directory-client-actions">
                                                              <button
                                                                className="icon-btn"
                                                                onClick={() =>
                                                                  openClient(
                                                                    client,
                                                                  )
                                                                }
                                                                disabled={
                                                                  !canEditClient
                                                                }
                                                                aria-label={`编辑${client.name}`}
                                                                title="编辑客户"
                                                              >
                                                                <Edit3
                                                                  size={15}
                                                                />
                                                              </button>
                                                              <button
                                                                className="icon-btn danger"
                                                                onClick={() =>
                                                                  removeClient(
                                                                    client.id,
                                                                  )
                                                                }
                                                                disabled={
                                                                  !canDeleteClient
                                                                }
                                                                aria-label={`删除${client.name}`}
                                                                title="删除客户"
                                                              >
                                                                <Trash2
                                                                  size={15}
                                                                />
                                                              </button>
                                                            </div>
                                                          </div>
                                                        ),
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </section>
            );
          })}
          {!filteredClients.length && <div className="empty">暂无匹配客户</div>}
        </div>
      </div>
    );
  }
  function renderRegionDirectoryFilters() {
    const updateRegionFilter = (
      key: keyof typeof regionFilters,
      value: string,
    ) => {
      if (key === "province")
        setRegionFilters({
          province: value,
          city: "",
          district: "",
          customerTypeId: "",
        });
      else if (key === "city")
        setRegionFilters((current) => ({
          ...current,
          city: value,
          district: "",
          customerTypeId: "",
        }));
      else if (key === "district")
        setRegionFilters((current) => ({
          ...current,
          district: value,
          customerTypeId: "",
        }));
      else
        setRegionFilters((current) => ({ ...current, customerTypeId: value }));
    };
    const filterSelect = (
      label: string,
      placeholder: string,
      value: string,
      options: string[],
      key: keyof typeof regionFilters,
      level: RegionLevel,
    ) => (
      <label className="region-filter">
        <span className="region-filter-label">
          <span>{label}</span>
          <button
            type="button"
            className="region-manage-btn"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openRegionManager(level);
            }}
            disabled={!canManageRegionLevel(level)}
            aria-label={`管理${label}分类`}
            title={`管理${label}分类`}
          >
            <Settings size={13} />
          </button>
        </span>
        <select
          value={value}
          onChange={(event) => updateRegionFilter(key, event.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
    const hasRegionFilters = Object.values(regionFilters).some(Boolean);
    return (
      <div className="client-directory region-directory panel">
        <div className="directory-head directory-filter-head">
          <div>
            <h3>客户目录</h3>
            <span>按地区与客户类型快速筛选客户</span>
          </div>
          <div className="directory-head-actions">
            <span>{filteredClients.length} 位客户</span>
            <button
              className="text-btn"
              onClick={() =>
                setRegionFilters({
                  province: "",
                  city: "",
                  district: "",
                  customerTypeId: "",
                })
              }
              disabled={!hasRegionFilters}
            >
              清除筛选
            </button>
          </div>
        </div>
        <div className="region-filter-bar">
          {filterSelect(
            "省份/直辖市",
            "请选择省份/直辖市",
            regionFilters.province,
            regionProvinceOptions,
            "province",
            "province",
          )}
          {filterSelect(
            "地市",
            "请选择地市",
            regionFilters.city,
            regionCityOptions,
            "city",
            "city",
          )}
          {filterSelect(
            "区/县",
            "请选择区/县",
            regionFilters.district,
            regionDistrictOptions,
            "district",
            "district",
          )}
          <label className="region-filter">
            <span className="region-filter-label">
              <span>客户类型</span>
              <button
                type="button"
                className="region-manage-btn"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openGroupManager();
                }}
                disabled={!canManageClientGroups}
                aria-label="管理客户类型分类"
                title="管理客户类型分类"
              >
                <Settings size={13} />
              </button>
            </span>
            <select
              value={regionFilters.customerTypeId}
              onChange={(event) =>
                updateRegionFilter("customerTypeId", event.target.value)
              }
            >
              <option value="">请选择客户类型</option>
              {regionTypeOptions.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <span className="region-filter-count">
            当前显示 {filteredClients.length} 位
          </span>
        </div>
        <div className="region-client-grid">
          {clientPageEntries.map((client) => {
            const type =
              clientGroups.find(
                (group) =>
                  group.id === (client.customerTypeId || client.groupId),
              )?.name || "未设置客户类型";
            return (
              <div className="directory-client" key={client.id}>
                <button
                  className="directory-client-main"
                  onClick={() => {
                    setSelectedId(client.id);
                    setActive("clients");
                  }}
                >
                  <span className="client-avatar">
                    {client.name.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{client.company}</strong>
                    <small>
                      {client.name} · {client.phone || "未设置电话"}
                    </small>
                    <small>
                      {client.province || "未设置省份"} ·{" "}
                      {client.city || "未设置地市"} ·{" "}
                      {client.district || "未设置区县"} · {type}
                    </small>
                  </span>
                </button>
                <div className="directory-client-actions">
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setSelectedId(client.id);
                      setActive("clients");
                    }}
                    aria-label={`查看${client.name}`}
                    title="查看客户详情"
                  >
                    <ChevronRight size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => openClient(client)}
                    disabled={!canEditClient}
                    aria-label={`编辑${client.name}`}
                    title="编辑客户"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => removeClient(client.id)}
                    disabled={!canDeleteClient}
                    aria-label={`删除${client.name}`}
                    title="删除客户"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
          {!filteredClients.length && <div className="empty">暂无匹配客户</div>}
        </div>
        {renderDashboardPagination({
          total: filteredClients.length,
          page: clientPage,
          pageSize: clientPageSize,
          pageCount: clientPageCount,
          onPageChange: setClientPage,
          onPageSizeChange: setClientPageSize,
        })}
      </div>
    );
  }
  function renderRegionDirectory() {
    /* Legacy nested renderer retained below while the flat renderer is used.
    const getTypeId = (client: Client) => client.customerTypeId || client.groupId;
    const provinces = [...new Set(filteredClients.map(client => client.province || '未设置省份'))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const toggleDirectoryLevel = (key: string) => setDirectoryCollapsedGroups(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
    const isCollapsed = (key: string) => !searchActive && directoryCollapsedGroups.includes(key);
    return <div className="client-directory region-directory panel"><div className="directory-head"><div><h3>客户目录</h3><span>地区为公共字段，客户类型统一归档</span></div><span>{filteredClients.length} 位客户</span></div>{provinces.map(province => { const provinceClients = filteredClients.filter(client => (client.province || '未设置省份') === province); const provinceKey = `province:${province}`; const provinceCollapsed = isCollapsed(provinceKey); const cities = [...new Set(provinceClients.map(client => client.city || '未设置地市'))].sort((a, b) => a.localeCompare(b, 'zh-CN')); return <section className="directory-region-level" key={provinceKey}><button className="directory-group-head" onClick={() => toggleDirectoryLevel(provinceKey)} aria-expanded={!provinceCollapsed}><span className="directory-collapse-icon"><ChevronDown size={15} /></span><strong>{province}</strong><span>{provinceClients.length} 位客户</span></button>{!provinceCollapsed && cities.map(city => { const cityClients = provinceClients.filter(client => (client.city || '未设置地市') === city); const cityKey = `${provinceKey}/city:${city}`; const cityCollapsed = isCollapsed(cityKey); const districts = [...new Set(cityClients.map(client => client.district || '未设置区县'))].sort((a, b) => a.localeCompare(b, 'zh-CN')); return <div className="directory-city-level" key={cityKey}><button className="directory-subgroup-head" onClick={() => toggleDirectoryLevel(cityKey)} aria-expanded={!cityCollapsed}><span className="directory-collapse-icon"><ChevronDown size={14} /></span><strong>{city}</strong><span>{cityClients.length} 位客户</span></button>{!cityCollapsed && districts.map(district => { const districtClients = cityClients.filter(client => (client.district || '未设置区县') === district); const districtKey = `${cityKey}/district:${district}`; const districtCollapsed = isCollapsed(districtKey); return <div className="directory-district-level" key={districtKey}><button className="directory-subgroup-head" onClick={() => toggleDirectoryLevel(districtKey)} aria-expanded={!districtCollapsed}><span className="directory-collapse-icon"><ChevronDown size={13} /></span><strong>{district}</strong><span>{districtClients.length} 位客户</span></button>{!districtCollapsed && <div className="directory-type-groups">{clientGroups.map(type => { const typeClients = sortClientsByNameLength(districtClients.filter(client => getTypeId(client) === type.id)); if (!typeClients.length) return null; const typeKey = `${districtKey}/type:${type.id}`; const typeCollapsed = isCollapsed(typeKey); return <div className="directory-type-level" key={typeKey}><button className="directory-type-head" onClick={() => toggleDirectoryLevel(typeKey)} aria-expanded={!typeCollapsed}><span className="directory-collapse-icon"><ChevronDown size={12} /></span><strong>{type.name}</strong><span>{typeClients.length} 位客户</span></button>{!typeCollapsed && <div className="directory-client-grid">{typeClients.map(client => <div className="directory-client" key={client.id}><button className="directory-client-main" onClick={() => { setSelectedId(client.id); setActive('clients'); }}><span className="client-avatar">{client.name.slice(0, 1)}</span><span><strong>{client.company}</strong><small>{client.name} · {client.phone || '未设置电话'}</small></span></button><div className="directory-client-actions"><button className="icon-btn" onClick={() => { setSelectedId(client.id); setActive('clients'); }} aria-label={`查看${client.name}`} title="查看客户详情"><ChevronRight size={15} /></button><button className="icon-btn" onClick={() => openClient(client)} disabled={!canEditClient} aria-label={`编辑${client.name}`} title="编辑客户"><Edit3 size={15} /></button><button className="icon-btn danger" onClick={() => removeClient(client.id)} disabled={!canDeleteClient} aria-label={`删除${client.name}`} title="删除客户"><Trash2 size={15} /></button></div></div>)}</div>}</div>; })}</div>}</div>; })}</div>}</div>; })}{!filteredClients.length && <div className="empty">暂无匹配客户</div>}</div>;
    */
    const rows = [...filteredClients].sort((a, b) => {
      const left = [
        a.province || "未设置省份",
        a.city || "未设置地市",
        a.district || "未设置区县",
        a.company,
      ].join("");
      const right = [
        b.province || "未设置省份",
        b.city || "未设置地市",
        b.district || "未设置区县",
        b.company,
      ].join("");
      return left.localeCompare(right, "zh-CN");
    });
    return (
      <div className="client-directory region-directory panel">
        <div className="directory-head">
          <div>
            <h3>客户目录</h3>
            <span>省份/直辖市 → 地市 → 区/县 → 客户类型 → 客户名称</span>
          </div>
          <span>{filteredClients.length} 位客户</span>
        </div>
        <div className="region-client-grid">
          {rows.map((client) => {
            const type =
              clientGroups.find(
                (group) =>
                  group.id === (client.customerTypeId || client.groupId),
              )?.name || "未设置客户类型";
            return (
              <div className="region-client-row" key={client.id}>
                <div className="region-breadcrumb">
                  <span>{client.province || "未设置省份"}</span>
                  <ChevronRight size={13} />
                  <span>{client.city || "未设置地市"}</span>
                  <ChevronRight size={13} />
                  <span>{client.district || "未设置区县"}</span>
                  <ChevronRight size={13} />
                  <strong>{type}</strong>
                </div>
                <div className="directory-client">
                  <button
                    className="directory-client-main"
                    onClick={() => {
                      setSelectedId(client.id);
                      setActive("clients");
                    }}
                  >
                    <span className="client-avatar">
                      {client.name.slice(0, 1)}
                    </span>
                    <span>
                      <strong>{client.company}</strong>
                      <small>
                        {client.name} · {client.phone || "未设置电话"}
                      </small>
                    </span>
                  </button>
                  <div className="directory-client-actions">
                    <button
                      className="icon-btn"
                      onClick={() => openClient(client)}
                      disabled={!canEditClient}
                      aria-label={`编辑${client.name}`}
                      title="编辑客户"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={() => removeClient(client.id)}
                      disabled={!canDeleteClient}
                      aria-label={`删除${client.name}`}
                      title="删除客户"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {!rows.length && <div className="empty">暂无匹配客户</div>}
      </div>
    );
  }
  const permissionHierarchy: {
    parent: PermissionKey;
    children: PermissionKey[];
  }[] = [
    { parent: "clients", children: clientSubPermissions },
    { parent: "fee", children: feeSubPermissions },
    { parent: "payment", children: paymentSubPermissions },
    { parent: "cost", children: costSubPermissions },
    { parent: "info", children: infoSubPermissions },
    { parent: "companyExpenses", children: companyExpenseSubPermissions },
    { parent: "dailyExpenses", children: dailyExpenseSubPermissions },
  ];
  const renderPermissionNode = (permission: {
    key: PermissionKey;
    label: string;
  }) => {
    const hierarchy = permissionHierarchy.find(
      (item) => item.parent === permission.key,
    );
    if (!hierarchy)
      return (
        <label key={permission.key}>
          <input
            type="checkbox"
            checked={permissionGroupPermissions.includes(permission.key)}
            onChange={(event) =>
              setPermissionEnabled(permission.key, event.target.checked)
            }
          />
          {permission.label}
        </label>
      );
    return (
      <div className="permission-client-group" key={permission.key}>
        <label>
          <input
            type="checkbox"
            checked={
              permissionGroupPermissions.includes(permission.key) ||
              hierarchy.children.some((key) =>
                permissionGroupPermissions.includes(key),
              )
            }
            onChange={(event) =>
              setPermissionEnabled(permission.key, event.target.checked)
            }
          />
          {permission.label}
        </label>
        <div className="permission-subitems">
          {allPermissions
            .filter((item) => hierarchy.children.includes(item.key))
            .map(renderPermissionNode)}
        </div>
      </div>
    );
  };
  const renderPermissionItem = (permission: {
    key: PermissionKey;
    label: string;
  }) => {
    return renderPermissionNode(permission);
  };
  const sortedUsers = [...users].sort(
    (a, b) => Number(b.role === "管理员") - Number(a.role === "管理员"),
  );
  const renderAuditRows = (entries: AuditLog[]) =>
    entries.map((log) => (
      <div className="audit-grid" key={log.id}>
        <time dateTime={log.createdAt}>
          {new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false })}
        </time>
        <span>{log.username}</span>
        <span className={`audit-action audit-${log.action}`}>
          {
            (
              {
                create: "新增",
                update: "修改",
                delete: "删除",
                security: "安全操作",
                send: "发送",
              } as Record<AuditAction, string>
            )[log.action]
          }
        </span>
        <span>{log.entity}</span>
        <span className="audit-summary">{log.summary}</span>
      </div>
    ));
  const renderAuditPagination = () => (
    <div className="audit-pagination">
      <span>
        共 {auditSearchEntries.length} 条
        {auditSearch.trim() ? `（全部 ${auditLogs.length} 条）` : ""}
      </span>
      <label>
        每页
        <select
          value={auditPageSize}
          onChange={(event) => {
            setAuditPageSize(Number(event.target.value));
            setAuditPage(1);
          }}
        >
          {[10, 20, 30, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        条
      </label>
      <button
        className="icon-btn"
        onClick={() => setAuditPage((page) => Math.max(1, page - 1))}
        disabled={auditPage <= 1}
        aria-label="上一页"
        title="上一页"
      >
        <ArrowLeft size={15} />
      </button>
      <div className="audit-page-numbers">
        {auditPageNumbers.map((page, index) => (
          <span key={page}>
            {index > 0 && page - auditPageNumbers[index - 1] > 1 && <i>...</i>}
            <button
              className={page === auditPage ? "active" : ""}
              onClick={() => setAuditPage(page)}
            >
              {page}
            </button>
          </span>
        ))}
      </div>
      <button
        className="icon-btn"
        onClick={() =>
          setAuditPage((page) => Math.min(auditPageCount, page + 1))
        }
        disabled={auditPage >= auditPageCount}
        aria-label="下一页"
        title="下一页"
      >
        <ChevronRight size={15} />
      </button>
      <label className="audit-jump">
        跳转
        <input
          type="number"
          min="1"
          max={auditPageCount}
          value={auditPage}
          onChange={(event) =>
            setAuditPage(
              Math.min(
                auditPageCount,
                Math.max(1, Number(event.target.value) || 1),
              ),
            )
          }
        />
        页
      </label>
    </div>
  );
  const renderDashboardPagination = ({
    total,
    page,
    pageSize,
    pageCount,
    onPageChange,
    onPageSizeChange,
  }: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  }) => {
    const pageNumbers = Array.from(
      { length: pageCount },
      (_, index) => index + 1,
    ).filter(
      (item) =>
        pageCount <= 7 ||
        item === 1 ||
        item === pageCount ||
        Math.abs(item - page) <= 1,
    );
    return (
      <div className="dashboard-pagination">
        <span>共 {total} 条</span>
        <label>
          每页
          <select
            value={pageSize}
            onChange={(event) => {
              onPageSizeChange(Number(event.target.value));
              onPageChange(1);
            }}
          >
            {[10, 20, 30, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          条
        </label>
        <button
          className="icon-btn"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="上一页"
          title="上一页"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="dashboard-page-numbers">
          {pageNumbers.map((item, index) => (
            <span key={item}>
              {index > 0 && item - pageNumbers[index - 1] > 1 && <i>...</i>}
              <button
                className={item === page ? "active" : ""}
                onClick={() => onPageChange(item)}
              >
                {item}
              </button>
            </span>
          ))}
        </div>
        <button
          className="icon-btn"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          aria-label="下一页"
          title="下一页"
        >
          <ChevronRight size={15} />
        </button>
        <label className="dashboard-jump">
          跳转
          <input
            type="number"
            min="1"
            max={pageCount}
            value={page}
            onChange={(event) =>
              onPageChange(
                Math.min(
                  pageCount,
                  Math.max(1, Number(event.target.value) || 1),
                ),
              )
            }
          />
          页
        </label>
      </div>
    );
  };
  const renderCompanyExpenseAnalysisPanel = () => (
    <section
      className={
        "panel dashboard-panel company-expense-analysis-panel " +
        (companyExpenseCollapsed ? "is-collapsed" : "")
      }
    >
      <div className="panel-head">
        <button
          className="panel-collapse-head"
          onClick={() => setCompanyExpenseCollapsed((current) => !current)}
          aria-expanded={!companyExpenseCollapsed}
        >
          <div>
            <h3>费用统计</h3>
            <span>
              按时间、费用类型和报销人汇总日常费用 · 共{" "}
              {companyExpenseRows.length} 条
            </span>
          </div>
          <ChevronDown size={17} />
        </button>
        <Banknote size={18} aria-hidden="true" />
      </div>
      <div className="profit-analysis-body company-expense-analysis-body">
        <div
          className="profit-filter-bar company-expense-filter-bar"
          aria-label="费用统计筛选条件"
        >
          <label>
            开始时间
            <input
              type="date"
              value={companyExpenseFilters.startDate}
              onChange={(event) =>
                setCompanyExpenseFilters((current) => ({
                  ...current,
                  startDate: event.target.value,
                }))
              }
            />
          </label>
          <label>
            结束时间
            <input
              type="date"
              min={companyExpenseFilters.startDate || undefined}
              value={companyExpenseFilters.endDate}
              onChange={(event) =>
                setCompanyExpenseFilters((current) => ({
                  ...current,
                  endDate: event.target.value,
                }))
              }
            />
          </label>
          <label>
            费用类型
            <select
              value={companyExpenseFilters.expenseType}
              onChange={(event) =>
                setCompanyExpenseFilters((current) => ({
                  ...current,
                  expenseType: event.target.value,
                }))
              }
            >
              <option value="">全部费用类型</option>
              {dailyExpenseTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            报销人
            <select
              value={companyExpenseFilters.reimburser}
              onChange={(event) =>
                setCompanyExpenseFilters((current) => ({
                  ...current,
                  reimburser: event.target.value,
                }))
              }
            >
              <option value="">全部报销人</option>
              {reimbursers.map((reimburser) => (
                <option key={reimburser} value={reimburser}>
                  {reimburser}
                </option>
              ))}
            </select>
          </label>
          <button
            className="text-btn profit-filter-reset"
            onClick={() =>
              setCompanyExpenseFilters({
                startDate: "",
                endDate: "",
                expenseType: "",
                reimburser: "",
              })
            }
            disabled={!Object.values(companyExpenseFilters).some(Boolean)}
          >
            清除筛选
          </button>
        </div>
        <div className="profit-summary-grid company-expense-summary-grid">
          <div>
            <span>统计费用</span>
            <strong className="red">{money(companyExpenseTotal)}</strong>
          </div>
          <div>
            <span>费用笔数</span>
            <strong>{companyExpenseRows.length}</strong>
          </div>
          <div>
            <span>平均费用</span>
            <strong>{money(companyExpenseAverage)}</strong>
          </div>
        </div>
        <div className="profit-analysis-table company-expense-analysis-table">
          <div className="profit-analysis-row profit-analysis-head">
            <span>时间</span>
            <span>费用类型</span>
            <span>报销人</span>
            <span>费用单据</span>
            <span>成本费用</span>
            <span>备注</span>
          </div>
          {companyExpensePageEntries.map((expense) => (
            <div
              className="profit-analysis-row company-expense-analysis-row"
              key={expense.id}
            >
              <span data-label="时间">{expense.recordDate}</span>
              <span data-label="费用类型">{expense.expenseType}</span>
              <span data-label="报销人">{expense.reimburser}</span>
              <strong data-label="费用单据">{expense.docId}</strong>
              <strong className="red" data-label="成本费用">
                {money(expense.amount)}
              </strong>
              <span data-label="备注">{expense.note || "无备注"}</span>
            </div>
          ))}
          {!companyExpenseRows.length && (
            <div className="empty">暂无符合筛选条件的费用记录</div>
          )}
        </div>
        {companyExpenseRows.length > 0 &&
          renderDashboardPagination({
            total: companyExpenseRows.length,
            page: companyExpensePage,
            pageSize: companyExpensePageSize,
            pageCount: companyExpensePageCount,
            onPageChange: setCompanyExpensePage,
            onPageSizeChange: setCompanyExpensePageSize,
          })}
      </div>
    </section>
  );
  const renderProfitAnalysisPanel = () => (
    <section
      className={
        "panel dashboard-panel profit-analysis-panel " +
        (profitAnalysisCollapsed ? "is-collapsed" : "")
      }
    >
      <div className="panel-head">
        <button
          className="panel-collapse-head"
          onClick={() => setProfitAnalysisCollapsed((current) => !current)}
          aria-expanded={!profitAnalysisCollapsed}
        >
          <div>
            <h3>利润分析</h3>
            <span>
              按费用单据汇总营收、成本、利润与欠款 · 共{" "}
              {profitAnalysisRows.length} 条
            </span>
          </div>
          <ChevronDown size={17} />
        </button>
        <TrendingUp size={18} aria-hidden="true" />
      </div>
      <div className="profit-analysis-body">
        <div className="profit-filter-bar" aria-label="利润分析筛选条件">
          <label>
            开始日期
            <input
              type="date"
              value={profitFilters.startDate}
              onChange={(event) =>
                setProfitFilters((current) => ({
                  ...current,
                  startDate: event.target.value,
                }))
              }
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              min={profitFilters.startDate || undefined}
              value={profitFilters.endDate}
              onChange={(event) =>
                setProfitFilters((current) => ({
                  ...current,
                  endDate: event.target.value,
                }))
              }
            />
          </label>
          <label>
            业务员
            <select
              value={profitFilters.employee}
              onChange={(event) =>
                setProfitFilters((current) => ({
                  ...current,
                  employee: event.target.value,
                  docId: "",
                }))
              }
            >
              <option value="">全部业务员</option>
              {profitAnalysisEmployees.map((employee) => (
                <option key={employee} value={employee}>
                  {employee}
                </option>
              ))}
            </select>
          </label>
          <label>
            客户
            <select
              value={profitFilters.clientId}
              onChange={(event) =>
                setProfitFilters((current) => ({
                  ...current,
                  clientId: event.target.value,
                  docId: "",
                }))
              }
            >
              <option value="">全部客户</option>
              {profitAnalysisClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company}
                </option>
              ))}
            </select>
          </label>
          <label>
            费用类型
            <select
              value={profitFilters.feeType}
              onChange={(event) =>
                setProfitFilters((current) => ({
                  ...current,
                  feeType: event.target.value,
                  docId: "",
                }))
              }
            >
              <option value="">全部费用类型</option>
              {feeTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            客户费用单据
            <select
              value={profitFilters.docId}
              onChange={(event) =>
                setProfitFilters((current) => ({
                  ...current,
                  docId: event.target.value,
                }))
              }
            >
              <option value="">全部费用单据</option>
              {profitAnalysisDocumentOptions.map((record) => (
                <option key={record.id} value={record.docId}>
                  {record.docId} ·{" "}
                  {clients.find((client) => client.id === record.clientId)
                    ?.company || "未知客户"}
                </option>
              ))}
            </select>
          </label>
          <button
            className="text-btn profit-filter-reset"
            onClick={() =>
              setProfitFilters({
                startDate: "",
                endDate: "",
                employee: "",
                clientId: "",
                feeType: "",
                docId: "",
              })
            }
            disabled={!Object.values(profitFilters).some(Boolean)}
          >
            清除筛选
          </button>
        </div>
        <div className="profit-summary-grid">
          <div>
            <span>营收</span>
            <strong>{money(profitAnalysisSummary.revenue)}</strong>
          </div>
          <div>
            <span>成本</span>
            <strong className="red">{money(profitAnalysisSummary.cost)}</strong>
          </div>
          <div>
            <span>利润</span>
            <strong
              className={profitAnalysisSummary.profit >= 0 ? "green" : "red"}
            >
              {money(profitAnalysisSummary.profit)}
            </strong>
          </div>
          <div>
            <span>欠款</span>
            <strong className={profitAnalysisSummary.arrears ? "red" : "green"}>
              {money(profitAnalysisSummary.arrears)}
            </strong>
          </div>
        </div>
        <div className="profit-analysis-table">
          <div className="profit-analysis-row profit-analysis-head">
            <span>费用单据</span>
            <span>客户名称</span>
            <span>费用类型</span>
            <span>业务员</span>
            <span>开始时间</span>
            <span>结束时间</span>
            <span>营收</span>
            <span>成本</span>
            <span>利润</span>
            <span>欠款</span>
            <span />
          </div>
          {profitAnalysisPageEntries.map((row) => (
            <div className="profit-analysis-row" key={row.id}>
              <strong data-label="费用单据">{row.docId}</strong>
              <span data-label="客户名称">{row.client}</span>
              <span data-label="费用类型">{row.feeType}</span>
              <span data-label="业务员">{row.employee}</span>
              <span data-label="开始时间">{row.startDate}</span>
              <span data-label="结束时间">{row.endDate || "待定"}</span>
              <strong data-label="营收">{money(row.revenue)}</strong>
              <strong className="red" data-label="成本">
                {money(row.cost)}
              </strong>
              <strong
                className={row.profit >= 0 ? "green" : "red"}
                data-label="利润"
              >
                {money(row.profit)}
              </strong>
              <strong
                className={row.arrears ? "red" : "green"}
                data-label="欠款"
              >
                {money(row.arrears)}
              </strong>
              <button
                type="button"
                className="icon-btn profit-client-link"
                onClick={() => {
                  setSelectedId(row.clientId);
                  setActive("clients");
                }}
                aria-label={`查看${row.client}客户详情`}
                title="查看客户详情"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          ))}
          {!profitAnalysisRows.length && (
            <div className="empty">暂无符合筛选条件的费用单据</div>
          )}
        </div>
        {profitAnalysisRows.length > 0 &&
          renderDashboardPagination({
            total: profitAnalysisRows.length,
            page: profitAnalysisPage,
            pageSize: profitAnalysisPageSize,
            pageCount: profitAnalysisPageCount,
            onPageChange: setProfitAnalysisPage,
            onPageSizeChange: setProfitAnalysisPageSize,
          })}
      </div>
    </section>
  );
  function renderCostRows(record: RecordItem) {
    const recordCosts = selectedCostItems.filter(
      (cost) => cost.docId === record.docId,
    );
    const rows: Array<CostItem | null> = recordCosts.length
      ? recordCosts
      : [null];
    return rows.map((cost, index) => {
      const amount = cost?.amount ?? 0;
      const profit = record.fee - amount;
      return (
        <div
          className="record-grid cost-grid cost-record-row"
          key={cost?.id || `${record.docId}-empty`}
        >
          <div>
            <strong>{record.docId}</strong>
            {recordCosts.length > 1 && <small>第 {index + 1} 笔成本</small>}
          </div>
          <span>{record.feeType || "未设置"}</span>
          <span>{cost?.reimburser || "未设置"}</span>
          <strong>{money(record.fee)}</strong>
          <strong className={cost ? "red" : "cost-empty-value"}>
            {cost ? money(amount) : "暂无成本记录"}
          </strong>
          <strong className={profit >= 0 ? "green" : "red"}>
            {money(profit)}
          </strong>
          <span className="cost-note-cell">{cost?.note || "暂无备注"}</span>
          <div className="record-actions">
            {cost && (
              <>
                <button
                  className="icon-btn"
                  onClick={() => openCostModal(cost)}
                  disabled={!canEditCost}
                  aria-label={`修改${record.docId}第${index + 1}笔成本费用`}
                  title="修改成本费用"
                >
                  <Edit3 size={15} />
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => removeCost(cost.id)}
                  disabled={!canDeleteCost}
                  aria-label={`删除${record.docId}第${index + 1}笔成本费用`}
                  title="删除成本费用"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            {index === 0 ? (
              <button
                className="icon-btn"
                onClick={() => openCostModal("new", record.docId)}
                disabled={!canCreateCost}
                aria-label={`为${record.docId}添加成本费用`}
                title="添加成本费用"
              >
                <Plus size={15} />
              </button>
            ) : (
              <span className="cost-action-placeholder" aria-hidden="true" />
            )}
          </div>
        </div>
      );
    });
  }

  return (
    <div className={"app-shell " + (mobileNavOpen ? "mobile-nav-open" : "")}>
      <button
        className="mobile-nav-backdrop"
        type="button"
        aria-label="关闭菜单"
        onClick={() => setMobileNavOpen(false)}
      />
      <aside className="app-sidebar" id="main-navigation">
        <div className="sidebar-brand">
          <div className="brand-mark">
            <CircleDollarSign size={20} />
          </div>
          <div>
            <strong>OA帮</strong>
            <span>费用客户管理系统</span>
          </div>
        </div>
        <nav>
          {canViewDashboard && (
            <button
              className={
                active === "dashboard" ? "nav-item active" : "nav-item"
              }
              onClick={() => {
                setActive("dashboard");
                setMobileNavOpen(false);
              }}
            >
              <LayoutDashboard size={17} />
              总览
            </button>
          )}
          {canViewClients && (
            <div className="nav-group">
              <button
                className={
                  active === "clients" ? "nav-item active" : "nav-item"
                }
                onClick={() => {
                  const alreadyOnClients = active === "clients";
                  setActive("clients");
                  setClientsExpanded((current) =>
                    alreadyOnClients ? !current : false,
                  );
                  if (!alreadyOnClients) setMobileNavOpen(false);
                }}
                aria-expanded={clientsExpanded}
              >
                <Users size={17} />
                客户列表
              </button>
              {clientsExpanded && (
                <div className="sub-nav">
                  {clientGroups.map(renderClientGroup)}
                  {!filteredClients.length && (
                    <div className="sub-empty">暂无客户</div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="nav-group">
            <button
              className={
                active === "companyExpenses" || active === "dailyExpenses"
                  ? "nav-item active"
                  : "nav-item"
              }
              onClick={() => {
                setActive("companyExpenses");
                setCompanyExpensesExpanded((current) => !current);
                setMobileNavOpen(false);
              }}
              aria-expanded={companyExpensesExpanded}
            >
              <Banknote size={17} />
              公司费用管理
            </button>
            <div className="sub-nav">
              <button
                className={
                  "sub-nav-item " + (active === "dailyExpenses" ? "active" : "")
                }
                onClick={() => {
                  setActive("dailyExpenses");
                  setCompanyExpensesExpanded(true);
                  setMobileNavOpen(false);
                }}
              >
                日常费用管理
              </button>
            </div>
          </div>
          {canViewUsers && (
            <button
              className={active === "users" ? "nav-item active" : "nav-item"}
              onClick={() => {
                setActive("users");
                setMobileNavOpen(false);
              }}
            >
              <Settings size={17} />
              权限管理
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">{session.name.slice(0, 1)}</div>
            <div>
              <strong>{session.name}</strong>
              <span>{session.role}</span>
            </div>
          </div>
          <button className="logout" onClick={logout}>
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu icon-btn"
            type="button"
            aria-label={mobileNavOpen ? "关闭菜单" : "打开菜单"}
            aria-controls="main-navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((current) => !current)}
          >
            <Menu size={19} />
          </button>
          <div>
            <p className="eyebrow">
              {active === "dashboard"
                ? "OVERVIEW"
                : active === "clients"
                  ? "CLIENTS"
                  : active === "companyExpenses"
                    ? "COMPANY EXPENSES"
                    : active === "dailyExpenses"
                      ? "DAILY EXPENSES"
                      : "ACCESS CONTROL"}
            </p>
            <h2>
              {active === "dashboard"
                ? "业务总览"
                : active === "clients"
                  ? "客户列表"
                  : active === "companyExpenses"
                    ? "公司费用管理"
                    : active === "dailyExpenses"
                      ? "日常费用管理"
                      : "权限管理"}
            </h2>
          </div>
          <div className="top-actions">
            <span className="today">
              <CalendarDays size={15} />
              2026年8月21日
            </span>
            <div
              className="account-menu"
              onMouseEnter={handleAccountMenuEnter}
              onMouseLeave={handleAccountMenuLeave}
            >
              <button
                className="top-avatar"
                onClick={toggleAccountMenu}
                aria-label="账户菜单"
                aria-expanded={accountMenuOpen}
              >
                {session.name.slice(0, 1)}
              </button>
              {accountMenuOpen && (
                <div className="account-menu-popover">
                  <div className="account-menu-user">
                    <strong>{session.username || session.name}</strong>
                    <span>{session.role}</span>
                  </div>
                  <div className="account-menu-divider" />
                  <button
                    onClick={() => {
                      setNewPassword("");
                      setConfirmPassword("");
                      closeAccountMenu();
                      setPasswordModal(true);
                    }}
                  >
                    <ShieldCheck size={16} />
                    修改密码
                  </button>
                  <button
                    className="account-menu-logout"
                    onClick={() => {
                      closeAccountMenu();
                      logout();
                    }}
                  >
                    <LogOut size={16} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {active === "dashboard" && (
          <>
            <section className="welcome">
              <div>
                <p className="eyebrow">
                  GOOD MORNING, {session.name.toUpperCase()}
                </p>
                <h1>今天也把账目理清楚。</h1>
                <p>客户服务周期和回款状态都在这里。</p>
              </div>
              <div className="welcome-rate">
                <span>本月回款率</span>
                <strong>
                  {totals.total
                    ? Math.round((totals.paid / totals.total) * 100)
                    : 0}
                  %
                </strong>
                <div className="welcome-rate-bar">
                  <span
                    style={{
                      width: `${totals.total ? (totals.paid / totals.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </section>
            <section className="kpi-grid">
              <div className="kpi">
                <span>客户总数</span>
                <strong>{clients.length}</strong>
                <small>活跃合作客户</small>
                <Users size={20} />
              </div>
              <div className="kpi">
                <span>应收总额</span>
                <strong>{money(totals.total)}</strong>
                <small>所有维护服务周期</small>
                <CircleDollarSign size={20} />
              </div>
              <div className="kpi">
                <span>已收款</span>
                <strong className="green">{money(totals.paid)}</strong>
                <small>累计已支付金额</small>
                <Check size={20} />
              </div>
              <div className="kpi">
                <span>待收款</span>
                <strong className="red">
                  {money(totals.total - totals.paid)}
                </strong>
                <small>需要跟进的余额</small>
                <Banknote size={20} />
              </div>
            </section>
            <section className="dashboard-grid">
              <div
                className={
                  "panel dashboard-panel " +
                  (recentClientsCollapsed ? "is-collapsed" : "")
                }
              >
                <div className="panel-head">
                  <button
                    className="panel-collapse-head"
                    onClick={() =>
                      setRecentClientsCollapsed((current) => !current)
                    }
                    aria-expanded={!recentClientsCollapsed}
                  >
                    <div>
                      <h3>最近客户</h3>
                      <span>
                        按增加时间倒序 · 最近 {latestClients.length} /{" "}
                        {clients.length} 位
                      </span>
                    </div>
                    <ChevronDown size={17} />
                  </button>
                  <button
                    className="text-btn"
                    onClick={() => setActive("clients")}
                  >
                    查看全部 <ChevronRight size={15} />
                  </button>
                </div>
                <div className="dashboard-panel-body">
                  <div className="dashboard-client-grid">
                    {recentClientsPageEntries.map((c) => (
                      <button
                        className="dashboard-client-card"
                        key={c.id}
                        onClick={() => {
                          setSelectedId(c.id);
                          setActive("clients");
                        }}
                      >
                        <span className="client-avatar">
                          {c.name.slice(0, 1)}
                        </span>
                        <span className="dashboard-client-copy">
                          <strong>{c.company}</strong>
                          <small>
                            {c.name} · {c.phone}
                          </small>
                          <small>
                            增加时间 {formatClientCreatedAt(c.createdAt)}
                          </small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    {!latestClients.length && (
                      <div className="empty">暂无客户记录</div>
                    )}
                  </div>
                  {renderDashboardPagination({
                    total: latestClients.length,
                    page: recentClientsPage,
                    pageSize: recentClientsPageSize,
                    pageCount: recentClientsPageCount,
                    onPageChange: setRecentClientsPage,
                    onPageSizeChange: setRecentClientsPageSize,
                  })}
                </div>
              </div>
              <div
                className={
                  "panel dashboard-panel " +
                  (remindersCollapsed ? "is-collapsed" : "")
                }
              >
                <div className="panel-head">
                  <button
                    className="panel-collapse-head"
                    onClick={() => setRemindersCollapsed((current) => !current)}
                    aria-expanded={!remindersCollapsed}
                  >
                    <div>
                      <h3>收款提醒</h3>
                      <span>
                        所有客户预计支付时间 10 天内或已过期 · 共{" "}
                        {reminderRecords.length} 条
                      </span>
                    </div>
                    <ChevronDown size={17} />
                  </button>
                  <Banknote size={18} />
                </div>
                <div className="dashboard-panel-body">
                  <div className="dashboard-reminder-grid">
                    {remindersPageEntries.map((r) => {
                      const c = clients.find((x) => x.id === r.clientId);
                      return (
                        <div className="dashboard-reminder-card" key={r.id}>
                          <div>
                            <strong>{c?.company ?? "未知客户"}</strong>
                            <small>
                              {c?.name || "未设置客户"} ·{" "}
                              {r.feeType || "费用记录"}
                            </small>
                            <small>预计支付 {r.paymentDate || "待定"}</small>
                          </div>
                          <b>{money(r.fee - paidFor(r))}</b>
                        </div>
                      );
                    })}
                    {!reminderRecords.length && (
                      <div className="empty">暂无收款提醒</div>
                    )}
                  </div>
                  {renderDashboardPagination({
                    total: reminderRecords.length,
                    page: remindersPage,
                    pageSize: remindersPageSize,
                    pageCount: remindersPageCount,
                    onPageChange: setRemindersPage,
                    onPageSizeChange: setRemindersPageSize,
                  })}
                </div>
              </div>
            </section>
          </>
        )}
        {active === "dashboard" && renderProfitAnalysisPanel()}
        {active === "companyExpenses" &&
          canViewCompanyExpenses &&
          renderCompanyExpenseAnalysisPanel()}
        {active === "dailyExpenses" && canViewDailyExpenses && (
          <section className="daily-expenses-page">
            <div className="panel-head daily-expenses-head">
              <div>
                <h3>日常费用管理</h3>
                <span>记录公司日常报销支出与费用凭证</span>
              </div>
              <div className="toolbar-actions">
                <button
                  className="secondary-btn small"
                  onClick={() => {
                    closeReimburserManager();
                    setDailyExpenseTypeManagerOpen(true);
                  }}
                  disabled={!canManageDailyExpenseTypes}
                >
                  <Settings size={15} />
                  费用类型
                </button>
                <button
                  className="secondary-btn small"
                  onClick={() => {
                    closeDailyExpenseTypeManager();
                    setReimburserManagerScope("daily");
                    setReimburserManagerOpen(true);
                  }}
                  disabled={!canManageDailyExpenseReimbursers}
                >
                  <Settings size={15} />
                  报销人
                </button>
                <button
                  className="primary-btn small"
                  onClick={() => openDailyExpenseModal("new")}
                  disabled={!canCreateDailyExpense}
                >
                  <Plus size={16} />
                  添加日常费用
                </button>
              </div>
            </div>
            <div className="daily-expenses-table">
              <div className="daily-expense-row daily-expense-row-head">
                <span>费用单据ID</span>
                <span>时间</span>
                <span>费用类型</span>
                <span>报销人</span>
                <span>成本费用（元）</span>
                <span>备注</span>
                <span>附件</span>
                <span>操作</span>
              </div>
              {dailyExpensePageEntries.map((expense) => (
                <div className="daily-expense-row" key={expense.id}>
                  <strong>{expense.docId}</strong>
                  <span>{expense.recordDate}</span>
                  <span>{expense.expenseType}</span>
                  <span>{expense.reimburser}</span>
                  <strong>{money(expense.amount)}</strong>
                  <span className="daily-expense-note">{expense.note}</span>
                  <span>{expense.attachments?.length || 0} 个</span>
                  <div className="record-actions">
                    <button
                      className="icon-btn"
                      onClick={() => openDailyExpenseModal(expense)}
                      disabled={!canEditDailyExpense}
                      aria-label={`编辑${expense.docId}`}
                      title="编辑日常费用"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={() => removeDailyExpense(expense.id)}
                      disabled={!canDeleteDailyExpense}
                      aria-label={`删除${expense.docId}`}
                      title="删除日常费用"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
              {!dailyExpenseRows.length && (
                <div className="empty">暂无日常费用记录</div>
              )}
            </div>
            {dailyExpenseRows.length > 0 && (
              <div className="daily-expense-pagination">
                {renderDashboardPagination({
                  total: dailyExpenseRows.length,
                  page: dailyExpensePage,
                  pageSize: dailyExpensePageSize,
                  pageCount: dailyExpensePageCount,
                  onPageChange: setDailyExpensePage,
                  onPageSizeChange: setDailyExpensePageSize,
                })}
              </div>
            )}
          </section>
        )}
        {active === "clients" && (
          <section className="clients-page">
            {!selected && (
              <div className="page-toolbar">
                <div>
                  <p className="eyebrow">CLIENT DIRECTORY</p>
                  <div className="client-context">客户列表</div>
                  <span className="client-list-description">
                    未选择分类时显示全部客户，选择后按当前分类筛选
                  </span>
                </div>
                <div className="toolbar-actions">
                  <div className="search-wrap">
                    <Search size={17} />
                    <input
                      placeholder="搜索客户、地区或客户类型"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <button
                    className="primary-btn"
                    onClick={() => openClient("new")}
                    disabled={!canCreateClient}
                  >
                    <Plus size={17} />
                    添加客户
                  </button>
                </div>
              </div>
            )}
            {!selected && renderRegionDirectoryFilters()}
            {!selected && (
              <div
                className={
                  "panel dashboard-panel latest-clients-panel " +
                  (recentClientsCollapsed ? "is-collapsed" : "")
                }
              >
                <div className="panel-head">
                  <button
                    className="panel-collapse-head"
                    onClick={() =>
                      setRecentClientsCollapsed((current) => !current)
                    }
                    aria-expanded={!recentClientsCollapsed}
                  >
                    <div>
                      <h3>最近客户</h3>
                      <span>
                        按增加时间倒序 · 最近 {latestClients.length} /{" "}
                        {clients.length} 位
                      </span>
                    </div>
                    <ChevronDown size={17} />
                  </button>
                  <span className="latest-clients-count">
                    共 {latestClients.length} 位
                  </span>
                </div>
                <div className="dashboard-panel-body">
                  <div className="dashboard-client-grid">
                    {recentClientsPageEntries.map((c) => (
                      <button
                        className="dashboard-client-card"
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                      >
                        <span className="client-avatar">
                          {c.name.slice(0, 1)}
                        </span>
                        <span className="dashboard-client-copy">
                          <strong>{c.company}</strong>
                          <small>
                            {c.name} · {c.phone}
                          </small>
                          <small>
                            增加时间 {formatClientCreatedAt(c.createdAt)}
                          </small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    {!latestClients.length && (
                      <div className="empty">暂无客户记录</div>
                    )}
                  </div>
                  {renderDashboardPagination({
                    total: latestClients.length,
                    page: recentClientsPage,
                    pageSize: recentClientsPageSize,
                    pageCount: recentClientsPageCount,
                    onPageChange: setRecentClientsPage,
                    onPageSizeChange: setRecentClientsPageSize,
                  })}
                </div>
              </div>
            )}
            {false && (
              <div className="client-directory panel">
                {clientGroups
                  .filter(
                    (group) =>
                      !searchActive ||
                      filteredClients.some(
                        (client) => client.groupId === group.id,
                      ),
                  )
                  .map((group) => {
                    const groupCollapsed =
                      !searchActive &&
                      directoryCollapsedGroups.includes(group.id);
                    const groupSubgroups = clientSubgroups.filter(
                      (subgroup) => subgroup.groupId === group.id,
                    );
                    const visibleSubgroups = groupSubgroups.filter(
                      (subgroup) =>
                        !searchActive ||
                        filteredClients.some(
                          (client) =>
                            client.groupId === group.id &&
                            client.subgroupId === subgroup.id,
                        ),
                    );
                    return (
                      <section className="directory-group" key={group.id}>
                        <button
                          className="directory-group-head"
                          onClick={() =>
                            setDirectoryCollapsedGroups((current) =>
                              groupCollapsed
                                ? current.filter((id) => id !== group.id)
                                : [...current, group.id],
                            )
                          }
                          aria-expanded={!groupCollapsed}
                        >
                          <span className="directory-collapse-icon">
                            <ChevronDown size={15} />
                          </span>
                          <strong>{group.name}</strong>
                          <span>
                            {
                              filteredClients.filter(
                                (c) => c.groupId === group.id,
                              ).length
                            }{" "}
                            位客户
                          </span>
                        </button>
                        {!groupCollapsed &&
                          visibleSubgroups.map((subgroup) => {
                            const subgroupCollapsed =
                              !searchActive &&
                              directoryCollapsedSubgroups.includes(subgroup.id);
                            const subgroupClients = sortClientsByNameLength(
                              filteredClients.filter(
                                (c) => c.subgroupId === subgroup.id,
                              ),
                            );
                            return (
                              <div
                                className="directory-subgroup"
                                key={subgroup.id}
                              >
                                <button
                                  className="directory-subgroup-head"
                                  onClick={() =>
                                    setDirectoryCollapsedSubgroups((current) =>
                                      subgroupCollapsed
                                        ? current.filter(
                                            (id) => id !== subgroup.id,
                                          )
                                        : [...current, subgroup.id],
                                    )
                                  }
                                  aria-expanded={!subgroupCollapsed}
                                >
                                  <span className="directory-collapse-icon">
                                    <ChevronDown size={14} />
                                  </span>
                                  <strong>{subgroup.name}</strong>
                                  <span>{subgroupClients.length} 位</span>
                                </button>
                                {!subgroupCollapsed && (
                                  <div className="directory-client-grid">
                                    {subgroupClients.map((c) => (
                                      <div
                                        className="directory-client"
                                        key={c.id}
                                      >
                                        <button
                                          className="directory-client-main"
                                          onClick={() => {
                                            setSelectedId(c.id);
                                            setActive("clients");
                                          }}
                                        >
                                          <span className="client-avatar">
                                            {c.name.slice(0, 1)}
                                          </span>
                                          <span>
                                            <strong>{c.company}</strong>
                                            <small>
                                              {c.name} · {c.phone}
                                            </small>
                                          </span>
                                        </button>
                                        <div className="directory-client-actions">
                                          <button
                                            className="icon-btn"
                                            onClick={() => {
                                              setSelectedId(c.id);
                                              setActive("clients");
                                            }}
                                            aria-label={`查看${c.name}`}
                                            title="查看客户详情"
                                          >
                                            <ChevronRight size={15} />
                                          </button>
                                          <button
                                            className="icon-btn"
                                            onClick={() => openClient(c)}
                                            disabled={!canEditClient}
                                            aria-label={`编辑${c.name}`}
                                            title="编辑客户"
                                          >
                                            <Edit3 size={15} />
                                          </button>
                                          <button
                                            className="icon-btn danger"
                                            onClick={() => removeClient(c.id)}
                                            disabled={!canDeleteClient}
                                            aria-label={`删除${c.name}`}
                                            title="删除客户"
                                          >
                                            <Trash2 size={15} />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                    {!subgroupClients.length && (
                                      <div className="sub-empty">
                                        该二级分类暂无客户
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        {!visibleSubgroups.length && (
                          <div className="sub-empty">该分组暂无匹配分类</div>
                        )}
                      </section>
                    );
                  })}
                {!filteredClients.length && (
                  <div className="empty">暂无匹配客户</div>
                )}
              </div>
            )}
            {selected && (
              <div className="panel detail">
                <div className="detail-head">
                  <div>
                    <div className="detail-avatar">
                      {selected.name.slice(0, 1)}
                    </div>
                    <div>
                      <h3>{selected.company}</h3>
                      <span>
                        {selected.name} · 添加于 {selected.createdAt}
                      </span>
                    </div>
                  </div>
                  <div className="detail-actions">
                    <button
                      className="secondary-btn small"
                      onClick={() => setSelectedId("")}
                      aria-label="返回客户列表"
                      title="返回客户列表"
                    >
                      <ArrowLeft size={15} />
                      返回客户列表
                    </button>
                  </div>
                </div>
                <div className="contact-strip">
                  <span>
                    <UserRound size={14} />
                    {selected.name}
                  </span>
                  <span>{selected.phone}</span>
                  <span>微信号：{selected.email || "未设置"}</span>
                </div>
                {visibleRecordTab === "fee" ? (
                  <>
                    <div className="record-head">
                      <div className="record-heading record-heading-stack">
                        <div className="record-tabs">
                          <button
                            className="active"
                            onClick={() => setRecordTab("fee")}
                          >
                            费用明细
                          </button>
                          <button onClick={() => setRecordTab("payment")}>
                            回款明细
                          </button>
                          {canViewCost && (
                            <button onClick={() => setRecordTab("cost")}>
                              成本明细
                            </button>
                          )}
                          <button onClick={() => setRecordTab("info")}>
                            运维资料
                          </button>
                        </div>
                        <span>可多次添加，按开始时间管理</span>
                      </div>
                      <div className="toolbar-actions">
                        <button
                          className="secondary-btn small"
                          onClick={() => {
                            setEditingEmployee(null);
                            setEmployeeName("");
                            setEmployeeModalOpen(true);
                          }}
                          disabled={!canManageEmployees}
                        >
                          <Settings size={15} />
                          业务经理管理
                        </button>
                        <button
                          className="secondary-btn small"
                          onClick={() => {
                            setEditingFeeType(null);
                            setFeeTypeName("");
                            setFeeTypeModalOpen(true);
                          }}
                          disabled={!canManageFeeTypes}
                        >
                          <Settings size={15} />
                          费用类型
                        </button>
                        <button
                          className="primary-btn small"
                          onClick={() => openRecord("new")}
                          disabled={!canCreateFee}
                        >
                          <Plus size={16} />
                          增加费用
                        </button>
                      </div>
                    </div>
                    <div className="record-summary">
                      <div>
                        <span>总费用</span>
                        <strong>
                          {money(
                            selectedRecords.reduce((s, r) => s + r.fee, 0),
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>已支付</span>
                        <strong className="green">
                          {money(
                            selectedRecords.reduce((s, r) => s + paidFor(r), 0),
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>未支付</span>
                        <strong className="red">
                          {money(
                            selectedRecords.reduce(
                              (s, r) => s + r.fee - paidFor(r),
                              0,
                            ),
                          )}
                        </strong>
                      </div>
                    </div>
                    <div className="records-table">
                      <div className="record-grid fee-record-grid record-grid-head">
                        <span>单据ID</span>
                        <span>费用类型</span>
                        <span>业务经理</span>
                        <span>费用</span>
                        <span>已支付</span>
                        <span>未支付</span>
                        <span>支付信息</span>
                        <span>开始时间</span>
                        <span>结束时间</span>
                        <span>预计支付时间</span>
                        <span />
                      </div>
                      {detailFeePageEntries.map((r) => (
                        <div className="record-grid fee-record-grid" key={r.id}>
                          <div>
                            <strong>{r.docId || r.id}</strong>
                            <small>
                              {[
                                r.projectName && `项目：${r.projectName}`,
                                r.note || "无备注",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          </div>
                          <span>{r.feeType || "维护费"}</span>
                          <span>{r.employee || "未设置"}</span>
                          <strong>{money(r.fee)}</strong>
                          <strong className="green">{money(paidFor(r))}</strong>
                          <strong
                            className={r.fee - paidFor(r) ? "red" : "green"}
                          >
                            {money(r.fee - paidFor(r))}
                          </strong>
                          <div>
                            <span>{r.method || "未设置"}</span>
                          </div>
                          <div>
                            <strong>{r.recordDate || r.start}</strong>
                          </div>
                          <span>{r.end || "待定"}</span>
                          <span>{r.paymentDate || "待定"}</span>
                          <div className="record-actions">
                            <button
                              className="icon-btn"
                              onClick={() => openRecord(r)}
                              disabled={!canEditFee}
                              aria-label="编辑费用明细"
                              title="编辑费用明细"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              className="icon-btn payment-action"
                              onClick={() =>
                                r.fee > paidFor(r)
                                  ? openPaymentModal(r.docId)
                                  : notify("该单据已结清")
                              }
                              disabled={!canEditFeePayment}
                              aria-label="添加回款"
                              title={
                                r.fee > paidFor(r) ? "添加回款" : "该单据已结清"
                              }
                            >
                              <Banknote size={15} />
                            </button>
                            <button
                              className="icon-btn danger"
                              onClick={() => removeRecord(r.id)}
                              disabled={!canDeleteFee}
                              aria-label="删除费用明细"
                              title="删除费用明细"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {!selectedRecords.length && (
                        <div className="empty">暂无费用明细</div>
                      )}
                    </div>
                    {selectedRecords.length > 0 &&
                      renderDashboardPagination({
                        total: selectedRecords.length,
                        page: detailFeePage,
                        pageSize: detailFeePageSize,
                        pageCount: detailFeePageCount,
                        onPageChange: setDetailFeePage,
                        onPageSizeChange: setDetailFeePageSize,
                      })}
                  </>
                ) : visibleRecordTab === "payment" ? (
                  <div className="arrears-page">
                    <div className="record-head">
                      <div className="record-heading record-heading-stack">
                        <div className="record-tabs">
                          <button onClick={() => setRecordTab("fee")}>
                            费用明细
                          </button>
                          <button
                            className="active"
                            onClick={() => setRecordTab("payment")}
                          >
                            回款明细
                          </button>
                          {canViewCost && (
                            <button onClick={() => setRecordTab("cost")}>
                              成本明细
                            </button>
                          )}
                          <button onClick={() => setRecordTab("info")}>
                            运维资料
                          </button>
                        </div>
                        <span>查看当前客户的回款单据与明细</span>
                      </div>
                      <div className="toolbar-actions">
                        <button
                          className="primary-btn small"
                          onClick={() => openPaymentModal()}
                          disabled={
                            !canCreatePayment ||
                            !selectedRecords.some((r) => r.fee > paidFor(r))
                          }
                        >
                          <Plus size={16} />
                          添加回款
                        </button>
                      </div>
                    </div>
                    <section
                      className={
                        "arrears-section " +
                        (arrearsCollapsed ? "is-collapsed" : "")
                      }
                    >
                      <button
                        type="button"
                        className="arrears-section-head"
                        onClick={() =>
                          setArrearsCollapsed((current) => !current)
                        }
                        aria-expanded={!arrearsCollapsed}
                      >
                        <span>
                          <strong>欠款单据</strong>
                          <small>查看当前客户未结清的回款单据</small>
                        </span>
                        <ChevronDown size={17} />
                      </button>
                      {!arrearsCollapsed && (
                        <div className="records-table">
                          <div className="record-grid record-grid-head">
                            <span>欠款单据ID</span>
                            <span>费用类型</span>
                            <span>应收金额</span>
                            <span>已收金额</span>
                            <span>剩余欠款</span>
                            <span>预计支付时间</span>
                          </div>
                          {selectedRecords
                            .filter((r) => r.fee > paidFor(r))
                            .map((r) => (
                              <div className="record-grid" key={r.id}>
                                <strong>{r.docId}</strong>
                                <span>{r.feeType}</span>
                                <strong>{money(r.fee)}</strong>
                                <strong className="green">
                                  {money(paidFor(r))}
                                </strong>
                                <strong className="red">
                                  {money(r.fee - paidFor(r))}
                                </strong>
                                <span>{r.paymentDate || "待定"}</span>
                              </div>
                            ))}
                          {!selectedRecords.some((r) => r.fee > paidFor(r)) && (
                            <div className="empty">暂无欠款单据</div>
                          )}
                        </div>
                      )}
                    </section>
                    <div className="record-head">
                      <div>
                        <h3>回款明细</h3>
                        <span>记录客户回款单据与明细</span>
                      </div>
                    </div>
                    <div className="records-table">
                      <div className="record-grid record-grid-head">
                        <span>单据ID</span>
                        <span>收款时间</span>
                        <span>收款方式</span>
                        <span>收款金额</span>
                        <span>备注信息</span>
                        <span>操作</span>
                      </div>
                      {detailPaymentPageEntries.map((p) => (
                        <div className="record-grid" key={p.id}>
                          <strong>{p.docId}</strong>
                          <span>{p.paymentDate}</span>
                          <span>{p.method}</span>
                          <strong className="green">{money(p.amount)}</strong>
                          <span>{p.note || "无备注"}</span>
                          <div className="record-actions">
                            <button
                              className="icon-btn"
                              onClick={() => openPaymentEdit(p)}
                              disabled={!canEditPaymentRecord}
                              aria-label="修改回款"
                              title="修改回款"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              className="icon-btn danger"
                              onClick={() => removePayment(p.id)}
                              disabled={!canDeletePayment}
                              aria-label="删除回款"
                              title="删除回款"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {!selectedPayments.length && (
                        <div className="empty">暂无回款明细</div>
                      )}
                    </div>
                    {selectedPayments.length > 0 &&
                      renderDashboardPagination({
                        total: selectedPayments.length,
                        page: detailPaymentPage,
                        pageSize: detailPaymentPageSize,
                        pageCount: detailPaymentPageCount,
                        onPageChange: setDetailPaymentPage,
                        onPageSizeChange: setDetailPaymentPageSize,
                      })}
                  </div>
                ) : visibleRecordTab === "cost" ? (
                  <div className="cost-page">
                    <div className="record-head">
                      <div className="record-heading record-heading-stack">
                        <div className="record-tabs">
                          <button onClick={() => setRecordTab("fee")}>
                            费用明细
                          </button>
                          <button onClick={() => setRecordTab("payment")}>
                            回款明细
                          </button>
                          <button
                            className="active"
                            onClick={() => setRecordTab("cost")}
                          >
                            成本明细
                          </button>
                          <button onClick={() => setRecordTab("info")}>
                            运维资料
                          </button>
                        </div>
                        <span>关联费用单据，记录成本并自动计算利润</span>
                      </div>
                      <div className="toolbar-actions">
                        <button
                          className="secondary-btn small"
                          onClick={() => {
                            setEditingReimburser(null);
                            setReimburserName("");
                            setReimburserManagerScope("cost");
                            setReimburserManagerOpen(true);
                          }}
                          disabled={!canManageCostReimbursers}
                        >
                          <Settings size={15} />
                          报销人
                        </button>
                        <button
                          className="secondary-btn small"
                          onClick={() => {
                            setEditingSupplier(null);
                            setSupplierName("");
                            setSupplierModalOpen(true);
                          }}
                          disabled={!canManageCostSuppliers}
                        >
                          <Settings size={15} />
                          供应商管理
                        </button>
                        <button
                          className="secondary-btn small"
                          onClick={() => {
                            setEditingCostType(null);
                            setCostTypeName("");
                            setCostTypeModalOpen(true);
                          }}
                          disabled={!canManageCostTypes}
                        >
                          <Settings size={15} />
                          费用类型
                        </button>
                        <button
                          className="primary-btn small"
                          onClick={() =>
                            openCostModal("new", selectedCostRecords[0]?.docId)
                          }
                          disabled={
                            !canCreateCost || !selectedCostRecords.length
                          }
                        >
                          <Plus size={16} />
                          添加成本
                        </button>
                      </div>
                    </div>
                    <div className="cost-record-selector">
                      <div className="cost-record-selector-head">
                        <div>
                          <strong>关联费用</strong>
                          <span>
                            默认关联当前客户全部费用，可按单据筛选成本和利润
                          </span>
                        </div>
                        <select
                          className="cost-record-select"
                          value={costRecordSelection}
                          onChange={(event) =>
                            setCostRecordSelection(event.target.value)
                          }
                          disabled={!selectedRecords.length}
                        >
                          <option value="">全部费用</option>
                          {selectedRecords.map((record) => (
                            <option key={record.docId} value={record.docId}>
                              {record.docId} · {record.feeType || "费用明细"} ·{" "}
                              {money(record.fee)}
                            </option>
                          ))}
                        </select>
                      </div>
                      {!selectedRecords.length && (
                        <div className="empty">暂无可关联费用单据</div>
                      )}
                    </div>
                    <div className="record-summary">
                      <div>
                        <span>关联费用</span>
                        <strong>
                          {money(
                            selectedCostRecords.reduce(
                              (sum, record) => sum + record.fee,
                              0,
                            ),
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>总成本</span>
                        <strong className="red">
                          {money(
                            selectedCostItems.reduce(
                              (sum, cost) => sum + cost.amount,
                              0,
                            ),
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>总利润</span>
                        <strong className="green">
                          {money(
                            selectedCostRecords.reduce(
                              (sum, record) => sum + record.fee,
                              0,
                            ) -
                              selectedCostItems.reduce(
                                (sum, cost) => sum + cost.amount,
                                0,
                              ),
                          )}
                        </strong>
                      </div>
                    </div>
                    <div className="records-table cost-records-table">
                      <div className="record-grid cost-grid record-grid-head">
                        <span>费用单据ID</span>
                        <span>费用类型</span>
                        <span>报销人</span>
                        <span>关联费用</span>
                        <span>成本费用</span>
                        <span>利润</span>
                        <span>备注</span>
                        <span>操作</span>
                      </div>
                      {detailCostPageEntries}
                      {!selectedCostRecords.length && (
                        <div className="empty">请至少选择一张费用单据</div>
                      )}
                    </div>
                    {selectedCostRows.length > 0 &&
                      renderDashboardPagination({
                        total: selectedCostRows.length,
                        page: detailCostPage,
                        pageSize: detailCostPageSize,
                        pageCount: detailCostPageCount,
                        onPageChange: setDetailCostPage,
                        onPageSizeChange: setDetailCostPageSize,
                      })}
                  </div>
                ) : (
                  <div className="customer-info-page">
                    <div className="record-head">
                      <div className="record-heading record-heading-stack">
                        <div className="record-tabs">
                          <button onClick={() => setRecordTab("fee")}>
                            费用明细
                          </button>
                          <button onClick={() => setRecordTab("payment")}>
                            回款明细
                          </button>
                          {canViewCost && (
                            <button onClick={() => setRecordTab("cost")}>
                              成本明细
                            </button>
                          )}
                          <button
                            className="active"
                            onClick={() => setRecordTab("info")}
                          >
                            运维资料
                          </button>
                        </div>
                        <span>记录当前客户的运维资料</span>
                      </div>
                      <div className="toolbar-actions">
                        <button
                          className="primary-btn small"
                          onClick={openCustomerInfoModal}
                          disabled={!canCreateInfo}
                        >
                          <Plus size={16} />
                          添加运维资料
                        </button>
                      </div>
                    </div>
                    <div className="customer-info-list">
                      <div className="customer-info-row customer-info-head">
                        <span>名称</span>
                        <span>备注</span>
                        <span>操作</span>
                      </div>
                      {detailInfoPageEntries.map((info) => (
                        <div className="customer-info-row" key={info.id}>
                          <strong>{info.name}</strong>
                          <span>{info.note || "无备注"}</span>
                          <div className="record-actions">
                            <button
                              className="icon-btn"
                              onClick={() => openCustomerInfoEdit(info)}
                              disabled={!canEditInfoRecord}
                              aria-label={`编辑${info.name}`}
                              title="编辑运维资料"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              className="icon-btn danger"
                              onClick={() => removeCustomerInfo(info.id)}
                              disabled={!canDeleteInfo}
                              aria-label={`删除${info.name}`}
                              title="删除运维资料"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {!selectedCustomerInfos.length && (
                        <div className="empty">暂无运维资料</div>
                      )}
                    </div>
                    {selectedCustomerInfos.length > 0 &&
                      renderDashboardPagination({
                        total: selectedCustomerInfos.length,
                        page: detailInfoPage,
                        pageSize: detailInfoPageSize,
                        pageCount: detailInfoPageCount,
                        onPageChange: setDetailInfoPage,
                        onPageSizeChange: setDetailInfoPageSize,
                      })}
                  </div>
                )}
              </div>
            )}
            {regionManager && (
              <RegionManagerModal
                manager={regionManager}
                items={managedRegionItems}
                regionCatalog={regionCatalog}
                regionLevelLabels={regionLevelLabels}
                regionName={regionName}
                editingRegionName={editingRegionName}
                canManage={canManageRegionLevel(regionManager.level)}
                onClose={() => {
                  setRegionManager(null);
                  setRegionName("");
                  setEditingRegionName(null);
                }}
                onParentChange={updateRegionManagerParent}
                onNameChange={setRegionName}
                onEdit={(name) => {
                  setEditingRegionName(name);
                  setRegionName(name);
                }}
                onRemove={removeRegionCategory}
                onSave={saveRegionCategory}
              />
            )}
          </section>
        )}
        {active === "users" && (
          <section
            className={
              "users-page panel " +
              (usersSectionCollapsed ? "is-collapsed" : "")
            }
          >
            <div className="panel-head">
              <button
                className="panel-collapse-head"
                onClick={() => setUsersSectionCollapsed((current) => !current)}
                aria-expanded={!usersSectionCollapsed}
              >
                <div>
                  <h3>团队成员</h3>
                  <span>管理登录权限与角色范围</span>
                </div>
                <ChevronDown size={17} />
              </button>
              <div className="toolbar-actions">
                <button
                  className="secondary-btn"
                  onClick={() => {
                    setEditingPermissionGroupId(null);
                    setPermissionGroupName("");
                    setPermissionGroupPermissions(
                      allPermissions.map((item) => item.key),
                    );
                    setPermissionGroupModal(true);
                  }}
                  disabled={session.role !== "管理员"}
                >
                  <Settings size={16} />
                  角色权限
                </button>
                <button
                  className="primary-btn"
                  onClick={() => {
                    setFormUser({
                      name: "",
                      username: "",
                      email: "",
                      phone: "",
                      password: "",
                      role: "财务",
                    });
                    setUserModal("new");
                  }}
                  disabled={session.role !== "管理员"}
                >
                  <Plus size={17} />
                  添加成员
                </button>
              </div>
            </div>
            <div className="permission-note">
              <ShieldCheck size={18} />
              <div>
                <strong>角色权限说明</strong>
                <span>
                  角色直接关联后台板块和客户详情标签权限。新成员首次登录需设置密码，管理员可重置其他成员密码。
                </span>
              </div>
            </div>
            <div className="users-table">
              <div className="user-grid user-head user-grid-with-group">
                <span>姓名</span>
                <span>用户名</span>
                <span>邮箱</span>
                <span>手机号</span>
                <span>角色</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              {sortedUsers.map((u) => (
                <div className="user-grid user-grid-with-group" key={u.id}>
                  <div className="user-cell">
                    <div className="client-avatar">{u.name.slice(0, 1)}</div>
                    <strong>{u.name}</strong>
                  </div>
                  <span>{u.username || "未设置"}</span>
                  <span>{u.email}</span>
                  <span>{u.phone || "未设置"}</span>
                  <span className="role-badge">{u.role}</span>
                  <span className="status-badge">{u.status}</span>
                  <div className="record-actions">
                    <button
                      className="icon-btn"
                      onClick={() => openUserEdit(u)}
                      disabled={session.role !== "管理员"}
                      aria-label={`编辑${u.name}`}
                      title="编辑成员"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => resetUserPassword(u)}
                      disabled={
                        u.id === session.id || session.role !== "管理员"
                      }
                      aria-label={`重置${u.name}密码`}
                      title="重置密码"
                    >
                      <ShieldCheck size={15} />
                    </button>
                    <button
                      className="text-btn"
                      disabled={
                        u.id === session.id || session.role !== "管理员"
                      }
                      onClick={() => toggleUserStatus(u)}
                    >
                      {u.status === "正常" ? "停用" : "启用"}
                    </button>
                    <button
                      className="icon-btn danger"
                      disabled={
                        u.id === session.id || session.role !== "管理员"
                      }
                      onClick={() => removeUser(u)}
                      aria-label={`删除${u.name}`}
                      title="删除成员"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {active === "users" && (
          <section
            className={
              "email-schedule panel " +
              (emailScheduleCollapsed ? "is-collapsed" : "")
            }
          >
            <div className="panel-head">
              <button
                className="panel-collapse-head"
                onClick={() => setEmailScheduleCollapsed((current) => !current)}
                aria-expanded={!emailScheduleCollapsed}
              >
                <div>
                  <h3>定时邮件发送</h3>
                  <span>将总览中的未付款收款提醒发送到指定邮箱</span>
                </div>
                <ChevronDown size={17} />
              </button>
              <Mail size={18} />
            </div>
            <div className="email-schedule-form">
              <label className="password-change-option">
                <span>启用定时发送</span>
                <input
                  type="checkbox"
                  checked={emailSchedule.enabled}
                  onChange={(event) =>
                    setEmailSchedule((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                  disabled={session.role !== "管理员"}
                />
                <i />
              </label>
              <label>
                发送频率
                <select
                  value={emailSchedule.frequency}
                  onChange={(event) =>
                    setEmailSchedule((current) => ({
                      ...current,
                      frequency: event.target.value as EmailFrequency,
                    }))
                  }
                  disabled={session.role !== "管理员"}
                >
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                </select>
              </label>
              {emailSchedule.frequency === "weekly" && (
                <label>
                  每周发送日
                  <select
                    value={emailSchedule.weekDay ?? 1}
                    onChange={(event) =>
                      setEmailSchedule((current) => ({
                        ...current,
                        weekDay: Number(event.target.value),
                      }))
                    }
                    disabled={session.role !== "管理员"}
                  >
                    {weekDayOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {emailSchedule.frequency === "monthly" && (
                <label>
                  每月发送日
                  <select
                    value={emailSchedule.monthDay ?? 1}
                    onChange={(event) =>
                      setEmailSchedule((current) => ({
                        ...current,
                        monthDay: Number(event.target.value),
                      }))
                    }
                    disabled={session.role !== "管理员"}
                  >
                    {monthDayOptions.map((day) => (
                      <option key={day} value={day}>
                        {day}号
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                发送时间
                <input
                  type="time"
                  value={emailSchedule.sendTime}
                  onChange={(event) =>
                    setEmailSchedule((current) => ({
                      ...current,
                      sendTime: event.target.value,
                    }))
                  }
                  disabled={session.role !== "管理员"}
                />
              </label>
              <label className="full">
                收件邮箱
                <input
                  value={emailRecipientsInput}
                  onChange={(event) =>
                    setEmailRecipientsInput(event.target.value)
                  }
                  disabled={session.role !== "管理员"}
                  placeholder="多个邮箱用逗号、分号或空格分隔"
                />
              </label>
            </div>
            <div className="email-schedule-actions">
              <button
                className="secondary-btn"
                onClick={saveEmailSchedule}
                disabled={session.role !== "管理员"}
              >
                <Check size={15} />
                保存设置
              </button>
              <button
                className="primary-btn"
                onClick={openReminderDraft}
                disabled={session.role !== "管理员"}
              >
                <Mail size={15} />
                测试发送
              </button>
            </div>
            <div className="permission-note">
              <Mail size={18} />
              <div>
                <strong>
                  {emailSchedule.enabled ? "定时发送已启用" : "定时发送未启用"}
                </strong>
                <span>
                  {emailServiceStatus.configured
                    ? `服务器SMTP已配置${emailServiceStatus.from ? `（发件人：${emailServiceStatus.from}）` : ""}。测试邮件立即发送，定时任务由后台服务执行，网页关闭后仍然有效。`
                    : "服务器SMTP尚未配置。请在正式服务器环境变量中补充企业邮箱SMTP信息后，再使用测试发送和定时发送。"}
                </span>
              </div>
            </div>
          </section>
        )}
        {active === "users" && (
          <section
            className={
              "audit-log panel " + (auditLogCollapsed ? "is-collapsed" : "")
            }
          >
            <div className="panel-head">
              <button
                className="panel-collapse-head"
                onClick={() => setAuditLogCollapsed((current) => !current)}
                aria-expanded={!auditLogCollapsed}
              >
                <div>
                  <h3>操作日志</h3>
                  <span>记录用户新增、修改、删除及安全操作</span>
                </div>
                <ChevronDown size={17} />
              </button>
              <div className="toolbar-actions">
                <div className="audit-search-field">
                  <Search size={18} />
                  <input
                    value={auditSearch}
                    onChange={(event) => {
                      setAuditSearch(event.target.value);
                      setAuditPage(1);
                    }}
                    placeholder="输入时间、操作人、动作或类型关键字"
                    aria-label="搜索操作日志"
                  />
                  {auditSearch && (
                    <button
                      type="button"
                      className="audit-search-clear"
                      onClick={() => {
                        setAuditSearch("");
                        setAuditPage(1);
                      }}
                      aria-label="清除日志搜索"
                      title="清除日志搜索"
                    >
                      ×
                    </button>
                  )}
                </div>
                <ShieldCheck size={18} />
              </div>
            </div>
            <div className="audit-table">
              <div className="audit-grid audit-head">
                <span>时间</span>
                <span>操作人</span>
                <span>动作</span>
                <span>数据类型</span>
                <span>详细说明</span>
              </div>
              {auditPageEntries.map((log) => (
                <div className="audit-grid" key={log.id}>
                  <time dateTime={log.createdAt}>
                    {new Date(log.createdAt).toLocaleString("zh-CN", {
                      hour12: false,
                    })}
                  </time>
                  <span>{log.username}</span>
                  <span className={`audit-action audit-${log.action}`}>
                    {
                      (
                        {
                          create: "新增",
                          update: "修改",
                          delete: "删除",
                          security: "安全操作",
                          send: "发送",
                        } as Record<AuditAction, string>
                      )[log.action]
                    }
                  </span>
                  <span>{log.entity}</span>
                  <span className="audit-summary">{log.summary}</span>
                </div>
              ))}
              {!auditSearchEntries.length && (
                <div className="empty">
                  {auditSearch.trim() ? "未找到匹配的操作日志" : "暂无操作日志"}
                </div>
              )}
            </div>
            {auditSearchEntries.length > 0 && renderAuditPagination()}
          </section>
        )}
      </main>
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
      {clientModal && (
        <Modal
          title={clientModal === "new" ? "添加客户" : "编辑客户"}
          onClose={() => setClientModal(null)}
        >
          <div className="form-grid">
            <label>
              公司名称
              <input
                value={formClient.company}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setFormClient((current) => ({ ...current, company: value }));
                }}
                placeholder="请输入公司名称"
              />
            </label>
            <label>
              客户姓名
              <input
                value={formClient.name}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setFormClient((current) => ({ ...current, name: value }));
                }}
                placeholder="例如：张伟"
              />
            </label>
            <label>
              联系电话
              <input
                value={formClient.phone}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setFormClient((current) => ({ ...current, phone: value }));
                }}
              />
            </label>
            <label>
              微信号码
              <input
                type="text"
                value={formClient.email}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setFormClient((current) => ({ ...current, email: value }));
                }}
              />
            </label>
            <label>
              省份/直辖市
              <select
                value={formClient.province}
                onChange={(e) => {
                  const province = e.currentTarget.value;
                  const city =
                    Object.keys(regionCatalog[province] || {})[0] || "";
                  const district =
                    (regionCatalog[province]?.[city] || [])[0] || "";
                  setFormClient((current) => ({
                    ...current,
                    province,
                    city,
                    district,
                  }));
                }}
              >
                <option value="">请选择省份/直辖市</option>
                {[
                  ...new Set([
                    ...Object.keys(regionCatalog),
                    ...(clients
                      .map((client) => client.province)
                      .filter(Boolean) as string[]),
                  ]),
                ].map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>
            <label>
              地市
              <select
                value={formClient.city}
                onChange={(e) => {
                  const city = e.currentTarget.value;
                  const district =
                    (regionCatalog[formClient.province]?.[city] ||
                      (clients
                        .filter(
                          (client) =>
                            client.province === formClient.province &&
                            client.city === city,
                        )
                        .map((client) => client.district)
                        .filter(Boolean) as string[]))[0] || "";
                  setFormClient((current) => ({ ...current, city, district }));
                }}
              >
                <option value="">请选择地市</option>
                {[
                  ...new Set([
                    ...Object.keys(regionCatalog[formClient.province] || {}),
                    ...(clients
                      .filter(
                        (client) => client.province === formClient.province,
                      )
                      .map((client) => client.city)
                      .filter(Boolean) as string[]),
                  ]),
                ].map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
            <label>
              区/县
              <select
                value={formClient.district}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setFormClient((current) => ({ ...current, district: value }));
                }}
              >
                <option value="">请选择区/县</option>
                {[
                  ...new Set([
                    ...(regionCatalog[formClient.province]?.[formClient.city] ||
                      []),
                    ...(clients
                      .filter(
                        (client) =>
                          client.province === formClient.province &&
                          client.city === formClient.city,
                      )
                      .map((client) => client.district)
                      .filter(Boolean) as string[]),
                  ]),
                ].map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </label>
            <label>
              客户类型
              <select
                value={formClient.customerTypeId}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setFormClient((current) => ({
                    ...current,
                    customerTypeId: value,
                    groupId: value,
                  }));
                }}
              >
                <option value="">请选择客户类型</option>
                {clientGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button
              className="secondary-btn"
              onClick={() => setClientModal(null)}
            >
              取消
            </button>
            <button className="primary-btn" onClick={saveClient}>
              <Check size={16} />
              保存客户
            </button>
          </div>
        </Modal>
      )}
      {groupModalOpen && (
        <Modal
          title="客户类型管理"
          onClose={() => {
            setGroupModalOpen(false);
            setEditingGroupId(null);
            setGroupName("");
          }}
        >
          <div className="group-manager">
            <span className="group-list-label">客户类型</span>
            {clientGroups.map((group, groupIndex) => (
              <div className="group-row" key={group.id}>
                <strong>{group.name}</strong>
                <div className="group-row-actions">
                  <button
                    className="icon-btn sort-btn"
                    onClick={() => moveGroup(group.id, -1)}
                    disabled={!canManageClientGroups || groupIndex === 0}
                    aria-label={`上移${group.name}`}
                    title="上移客户类型"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="icon-btn sort-btn"
                    onClick={() => moveGroup(group.id, 1)}
                    disabled={
                      !canManageClientGroups ||
                      groupIndex === clientGroups.length - 1
                    }
                    aria-label={`下移${group.name}`}
                    title="下移客户类型"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingGroupId(group.id);
                      setGroupName(group.name);
                    }}
                    disabled={!canManageClientGroups}
                    aria-label={`编辑${group.name}`}
                    title="编辑客户类型"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => removeGroup(group.id)}
                    disabled={!canManageClientGroups}
                    aria-label={`删除${group.name}`}
                    title="删除客户类型"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="group-add-form">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              disabled={!canManageClientGroups}
              placeholder={
                editingGroupId ? "修改客户类型名称" : "新增客户类型名称"
              }
            />
            <button
              className="secondary-btn"
              onClick={editingGroupId ? saveGroupEdit : addGroup}
              disabled={!canManageClientGroups}
            >
              {editingGroupId ? <Check size={15} /> : <Plus size={15} />}
              {editingGroupId ? "保存修改" : "添加类型"}
            </button>
          </div>
          <div className="modal-actions">
            <button
              className="primary-btn"
              onClick={() => {
                setGroupModalOpen(false);
                setEditingGroupId(null);
                setGroupName("");
                notify("客户类型已保存");
              }}
            >
              <Check size={16} />
              完成
            </button>
          </div>
        </Modal>
      )}
      {feeTypeModalOpen && (
        <Modal title="费用类型管理" onClose={() => setFeeTypeModalOpen(false)}>
          <div className="group-manager compact-item-manager">
            <span className="group-list-label">费用类型</span>
            {feeTypes.map((type, typeIndex) => (
              <div className="group-row compact-item-card" key={type}>
                <strong title={type}>{type}</strong>
                <div className="group-row-actions">
                  <button
                    className="icon-btn sort-btn"
                    onClick={() => moveFeeType(type, -1)}
                    disabled={!canManageFeeTypes || typeIndex === 0}
                    aria-label={`上移${type}`}
                    title="上移费用类型"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="icon-btn sort-btn"
                    onClick={() => moveFeeType(type, 1)}
                    disabled={
                      !canManageFeeTypes || typeIndex === feeTypes.length - 1
                    }
                    aria-label={`下移${type}`}
                    title="下移费用类型"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingFeeType(type);
                      setFeeTypeName(type);
                    }}
                    disabled={!canManageFeeTypes}
                    aria-label={`编辑${type}`}
                    title="编辑费用类型"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => removeFeeType(type)}
                    disabled={!canManageFeeTypes}
                    aria-label={`删除${type}`}
                    title="删除费用类型"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="group-add-form">
            <input
              value={feeTypeName}
              onChange={(e) => setFeeTypeName(e.target.value)}
              disabled={!canManageFeeTypes}
              placeholder={editingFeeType ? "修改费用类型" : "新增费用类型"}
            />
            <button
              className="secondary-btn"
              onClick={editingFeeType ? saveFeeTypeEdit : addFeeType}
              disabled={!canManageFeeTypes}
            >
              {editingFeeType ? <Check size={15} /> : <Plus size={15} />}
              {editingFeeType ? "保存修改" : "添加类型"}
            </button>
          </div>
          <div className="modal-actions">
            <button
              className="primary-btn"
              onClick={() => {
                setFeeTypeModalOpen(false);
                setEditingFeeType(null);
                setFeeTypeName("");
              }}
            >
              <Check size={16} />
              完成
            </button>
          </div>
        </Modal>
      )}
      {employeeModalOpen && (
        <Modal title="业务经理管理" onClose={() => setEmployeeModalOpen(false)}>
          <div className="group-manager employee-manager">
            <span className="group-list-label">业务经理（按姓名长度排序）</span>
            {sortTextValues(employees).map((employee) => (
              <div className="group-row employee-manager-row" key={employee}>
                <strong title={employee}>{employee}</strong>
                <div className="group-row-actions">
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingEmployee(employee);
                      setEmployeeName(employee);
                    }}
                    disabled={!canManageEmployees}
                    aria-label={`编辑${employee}`}
                    title="编辑业务经理"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => removeEmployee(employee)}
                    disabled={!canManageEmployees}
                    aria-label={`删除${employee}`}
                    title="删除业务经理"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="group-add-form">
            <input
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              disabled={!canManageEmployees}
              placeholder={
                editingEmployee ? "修改业务经理姓名" : "新增业务经理姓名"
              }
            />
            <button
              className="secondary-btn"
              onClick={editingEmployee ? saveEmployeeEdit : addEmployee}
              disabled={!canManageEmployees}
            >
              {editingEmployee ? <Check size={15} /> : <Plus size={15} />}
              {editingEmployee ? "保存修改" : "添加业务经理"}
            </button>
          </div>
          <div className="modal-actions">
            <button
              className="primary-btn"
              onClick={() => {
                setEmployeeModalOpen(false);
                setEditingEmployee(null);
                setEmployeeName("");
              }}
            >
              <Check size={16} />
              完成
            </button>
          </div>
        </Modal>
      )}
      {supplierModalOpen && (
        <Modal
          title="供应商管理"
          onClose={() => {
            setSupplierModalOpen(false);
            setEditingSupplier(null);
            setSupplierName("");
            setSupplierContact("");
            setSupplierPhone("");
          }}
          className="supplier-manager-modal"
        >
          <div className="supplier-manager-list">
            <div className="supplier-manager-head">
              <span>供应商（按名称长度排序）</span>
              <span>联系人</span>
              <span>联系电话</span>
              <span>操作</span>
            </div>
            {sortTextValues(suppliers).map((supplier) => {
              const details = supplierDetails[supplier] || {
                contact: "",
                phone: "",
              };
              return (
                <div className="supplier-manager-row" key={supplier}>
                  <strong title={supplier}>{supplier}</strong>
                  <span>{details.contact || "未设置"}</span>
                  <span>{details.phone || "未设置"}</span>
                  <div className="group-row-actions">
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setEditingSupplier(supplier);
                        setSupplierName(supplier);
                      }}
                      disabled={!canManageCostSuppliers}
                      aria-label={`编辑${supplier}`}
                      title="编辑供应商"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={() => removeSupplier(supplier)}
                      disabled={!canManageCostSuppliers}
                      aria-label={`删除${supplier}`}
                      title="删除供应商"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="supplier-add-form">
            <label>
              供应商名称
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                disabled={!canManageCostSuppliers}
                placeholder={
                  editingSupplier ? "修改供应商名称" : "新增供应商名称"
                }
              />
            </label>
            <label>
              联系人
              <input
                value={supplierContact}
                onChange={(e) => setSupplierContact(e.target.value)}
                disabled={!canManageCostSuppliers}
                placeholder="请输入联系人"
              />
            </label>
            <label>
              联系电话
              <input
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                disabled={!canManageCostSuppliers}
                placeholder="请输入联系电话"
              />
            </label>
            <button
              className="secondary-btn"
              onClick={editingSupplier ? saveSupplierEdit : addSupplier}
              disabled={!canManageCostSuppliers}
            >
              {editingSupplier ? <Check size={15} /> : <Plus size={15} />}
              {editingSupplier ? "保存修改" : "添加供应商"}
            </button>
          </div>
          <div className="modal-actions">
            <button
              className="primary-btn"
              onClick={() => {
                setSupplierModalOpen(false);
                setEditingSupplier(null);
                setSupplierName("");
                setSupplierContact("");
                setSupplierPhone("");
              }}
            >
              <Check size={16} />
              完成
            </button>
          </div>
        </Modal>
      )}
      {costTypeModalOpen && (
        <Modal
          title="成本明细费用类型管理"
          onClose={() => setCostTypeModalOpen(false)}
        >
          <div className="group-manager compact-item-manager">
            <span className="group-list-label">成本类型</span>
            {costTypes.map((type) => (
              <div className="group-row compact-item-card" key={type}>
                <strong title={type}>{type}</strong>
                <div className="group-row-actions">
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingCostType(type);
                      setCostTypeName(type);
                    }}
                    disabled={!canManageCostTypes}
                    aria-label={`编辑${type}`}
                    title="编辑成本类型"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => removeCostType(type)}
                    disabled={!canManageCostTypes}
                    aria-label={`删除${type}`}
                    title="删除成本类型"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="group-add-form">
            <input
              value={costTypeName}
              onChange={(e) => setCostTypeName(e.target.value)}
              disabled={!canManageCostTypes}
              placeholder={editingCostType ? "修改成本类型" : "新增成本类型"}
            />
            <button
              className="secondary-btn"
              onClick={editingCostType ? saveCostTypeEdit : addCostType}
              disabled={!canManageCostTypes}
            >
              {editingCostType ? <Check size={15} /> : <Plus size={15} />}
              {editingCostType ? "保存修改" : "添加类型"}
            </button>
          </div>
          <div className="modal-actions">
            <button
              className="primary-btn"
              onClick={() => {
                setCostTypeModalOpen(false);
                setEditingCostType(null);
                setCostTypeName("");
              }}
            >
              <Check size={16} />
              完成
            </button>
          </div>
        </Modal>
      )}
      {recordModal && (
        <Modal
          title={
            recordModal === "new"
              ? `添加费用明细 · ${selected?.company ?? ""}`
              : `编辑费用明细 · ${selected?.company ?? ""}`
          }
          onClose={closeRecordModal}
          className="record-modal"
        >
          <div className="form-grid record-form-grid">
            {recordModal !== "new" && (
              <label>
                单据ID
                <input value={recordModal.docId} readOnly />
              </label>
            )}
            {recordModal === "new" && (
              <label>
                单据ID
                <input
                  value={makeDocId(formRecord.recordDate, records)}
                  readOnly
                />
              </label>
            )}
            <label>
              费用类型
              <select
                required
                value={formRecord.feeType}
                onChange={(e) =>
                  setFormRecord({ ...formRecord, feeType: e.target.value })
                }
              >
                <option value="" disabled>
                  请选择费用类型
                </option>
                {feeTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              开始时间
              <input
                ref={recordDateInput}
                type="date"
                value={formRecord.recordDate}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setFormRecord((current) => ({
                    ...current,
                    recordDate: value,
                  }));
                }}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  setFormRecord((current) => ({
                    ...current,
                    recordDate: value,
                  }));
                }}
              />
            </label>
            <label>
              结束时间
              <input
                type="date"
                min={formRecord.recordDate || undefined}
                value={formRecord.end}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setFormRecord((current) => ({ ...current, end: value }));
                }}
              />
            </label>
            <label>
              业务经理
              <select
                required
                value={formRecord.employee}
                onChange={(e) =>
                  setFormRecord({ ...formRecord, employee: e.target.value })
                }
              >
                <option value="" disabled>
                  请选择业务经理
                </option>
                {employees.map((employee) => (
                  <option key={employee} value={employee}>
                    {employee}
                  </option>
                ))}
              </select>
            </label>
            <label>
              费用金额（元）
              <input
                type="number"
                min="0"
                value={formRecord.fee}
                onChange={(e) =>
                  setFormRecord({ ...formRecord, fee: e.target.value })
                }
              />
            </label>
            <label>
              支付金额（元）
              <input
                type="number"
                min="0"
                value={formRecord.paid}
                onChange={(e) =>
                  setFormRecord({ ...formRecord, paid: e.target.value })
                }
              />
            </label>
            <label>
              支付方式
              <select
                required
                value={formRecord.method}
                onChange={(e) =>
                  setFormRecord({ ...formRecord, method: e.target.value })
                }
              >
                <option value="">请选择</option>
                <option value="未付款">未付款</option>
                <option>银行转账</option>
                <option>微信支付</option>
                <option>支付宝</option>
                <option>现金</option>
              </select>
            </label>
            <label>
              预计支付时间
              <input
                ref={recordPaymentDateInput}
                type="date"
                value={formRecord.paymentDate}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setFormRecord((current) => ({
                    ...current,
                    paymentDate: value,
                  }));
                }}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  setFormRecord((current) => ({
                    ...current,
                    paymentDate: value,
                  }));
                }}
              />
            </label>
            <label>
              项目名称
              <input
                value={formRecord.projectName}
                onChange={(e) =>
                  setFormRecord({ ...formRecord, projectName: e.target.value })
                }
                placeholder="可选填写项目名称"
              />
            </label>
            <label className="full">
              备注
              <textarea
                rows={3}
                value={formRecord.note}
                onChange={(e) =>
                  setFormRecord({ ...formRecord, note: e.target.value })
                }
                placeholder="填写服务内容或收款备注"
              />
            </label>
            <AttachmentPanel
              note="费用凭证必填，选中后立即上传"
              inputRef={recordAttachmentInput}
              savedAttachments={savedAttachments}
              pendingAttachments={pendingAttachments}
              onChange={handleRecordAttachments}
              onRemoveSaved={removeSavedAttachment}
              onRemovePending={removePendingAttachment}
            />
          </div>
          <div className="calc-box">
            <strong>
              未支付{" "}
              {money(
                Math.max(
                  0,
                  Number(formRecord.fee || 0) - Number(formRecord.paid || 0),
                ),
              )}
            </strong>
          </div>
          <div className="modal-actions">
            <button
              className="secondary-btn"
              onClick={closeRecordModal}
              disabled={recordSaving}
            >
              取消
            </button>
            <button
              className="primary-btn"
              onClick={saveRecord}
              disabled={
                recordSaving ||
                pendingAttachments.length > 0 ||
                (recordModal === "new" ? !canCreateFee : !canEditFee)
              }
            >
              <Check size={16} />
              {recordSaving ? "正在保存" : "保存费用明细"}
            </button>
          </div>
        </Modal>
      )}
      {dailyExpenseTypeManagerOpen && (
        <Modal
          title="费用类型管理"
          onClose={closeDailyExpenseTypeManager}
          className="daily-expense-manager-modal"
        >
          <div className="group-manager">
            <span className="group-list-label">费用类型（按字符长度排序）</span>
            {dailyExpenseTypes.map((item) => (
              <div className="group-row" key={item}>
                <strong>{item}</strong>
                <div className="group-row-actions">
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingDailyExpenseType(item);
                      setDailyExpenseTypeName(item);
                    }}
                    aria-label={`编辑${item}`}
                    title="编辑费用类型"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => removeDailyExpenseListValue("type", item)}
                    aria-label={`删除${item}`}
                    title="删除费用类型"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="group-add-form">
            <input
              value={dailyExpenseTypeName}
              onChange={(event) => setDailyExpenseTypeName(event.target.value)}
              placeholder={
                editingDailyExpenseType ? "修改费用类型" : "新增费用类型"
              }
            />
            <button
              className="secondary-btn"
              onClick={() => saveDailyExpenseListValue("type")}
            >
              {editingDailyExpenseType ? (
                <Check size={15} />
              ) : (
                <Plus size={15} />
              )}
              {editingDailyExpenseType ? "保存修改" : "添加类型"}
            </button>
          </div>
          <div className="modal-actions">
            <button
              className="primary-btn"
              onClick={closeDailyExpenseTypeManager}
            >
              <Check size={16} />
              完成
            </button>
          </div>
        </Modal>
      )}
      {reimburserManagerOpen && (
        <Modal
          title="报销人管理"
          onClose={closeReimburserManager}
          className="daily-expense-manager-modal"
        >
          <div className="group-manager">
            <span className="group-list-label">报销人（按字符长度排序）</span>
            {reimbursers.map((item) => (
              <div className="group-row" key={item}>
                <strong>{item}</strong>
                <div className="group-row-actions">
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingReimburser(item);
                      setReimburserName(item);
                    }}
                    disabled={!canManageActiveReimbursers}
                    aria-label={`编辑${item}`}
                    title="编辑报销人"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() =>
                      removeDailyExpenseListValue("reimburser", item)
                    }
                    disabled={!canManageActiveReimbursers}
                    aria-label={`删除${item}`}
                    title="删除报销人"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="group-add-form">
            <input
              value={reimburserName}
              onChange={(event) => setReimburserName(event.target.value)}
              disabled={!canManageActiveReimbursers}
              placeholder={editingReimburser ? "修改报销人" : "新增报销人"}
            />
            <button
              className="secondary-btn"
              onClick={() => saveDailyExpenseListValue("reimburser")}
              disabled={!canManageActiveReimbursers}
            >
              {editingReimburser ? <Check size={15} /> : <Plus size={15} />}
              {editingReimburser ? "保存修改" : "添加报销人"}
            </button>
          </div>
          <div className="modal-actions">
            <button className="primary-btn" onClick={closeReimburserManager}>
              <Check size={16} />
              完成
            </button>
          </div>
        </Modal>
      )}
      {dailyExpenseModal && (
        <Modal
          title={dailyExpenseModal === "new" ? "添加日常费用" : "编辑日常费用"}
          onClose={closeDailyExpenseModal}
        >
          <div className="form-grid daily-expense-form">
            <label>
              费用单据ID
              <input
                value={
                  dailyExpenseModal === "new"
                    ? makeDailyExpenseDocId(
                        formDailyExpense.recordDate,
                        dailyExpenses,
                      )
                    : dailyExpenseModal.docId
                }
                readOnly
              />
            </label>
            <label>
              时间选择
              <input
                type="date"
                value={formDailyExpense.recordDate}
                onChange={(event) =>
                  setFormDailyExpense((current) => ({
                    ...current,
                    recordDate: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              费用类型
              <select
                required
                value={formDailyExpense.expenseType}
                onChange={(event) =>
                  setFormDailyExpense((current) => ({
                    ...current,
                    expenseType: event.target.value,
                  }))
                }
              >
                <option value="">请选择费用类型</option>
                {dailyExpenseTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              报销人
              <select
                required
                value={formDailyExpense.reimburser}
                onChange={(event) =>
                  setFormDailyExpense((current) => ({
                    ...current,
                    reimburser: event.target.value,
                  }))
                }
              >
                <option value="">请选择报销人</option>
                {reimbursers.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              成本费用（元）
              <input
                type="number"
                min="0"
                value={formDailyExpense.amount}
                onChange={(event) =>
                  setFormDailyExpense((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
              />
            </label>
            <label className="full">
              备注
              <textarea
                rows={3}
                value={formDailyExpense.note}
                onChange={(event) =>
                  setFormDailyExpense((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="填写报销事由或费用说明"
              />
            </label>
            <AttachmentPanel
              note="费用凭证必填，选中后立即上传"
              inputRef={dailyExpenseAttachmentInput}
              savedAttachments={savedDailyExpenseAttachments}
              pendingAttachments={pendingDailyExpenseAttachments}
              onChange={handleDailyExpenseAttachments}
              onRemoveSaved={removeSavedDailyExpenseAttachment}
              onRemovePending={removePendingDailyExpenseAttachment}
            />
          </div>
          <div className="modal-actions">
            <button
              className="secondary-btn"
              onClick={closeDailyExpenseModal}
              disabled={dailyExpenseSaving}
            >
              取消
            </button>
            <button
              className="primary-btn"
              onClick={saveDailyExpense}
              disabled={
                dailyExpenseSaving || pendingDailyExpenseAttachments.length > 0
              }
            >
              <Check size={16} />
              {dailyExpenseSaving ? "正在保存" : "保存日常费用"}
            </button>
          </div>
        </Modal>
      )}
      {paymentModal && (
        <Modal
          title={`${editingPaymentId ? "修改回款" : "添加回款"} · ${selected?.company ?? ""}`}
          onClose={closePaymentModal}
        >
          <div className="form-grid">
            <label className="full">
              欠款单据ID
              <select
                value={formPayment.docId}
                onChange={(e) =>
                  setFormPayment({ ...formPayment, docId: e.target.value })
                }
              >
                {selectedRecords
                  .filter(
                    (r) => r.fee > paidFor(r) || r.docId === formPayment.docId,
                  )
                  .map((r) => (
                    <option key={r.docId} value={r.docId}>
                      {r.docId} · {r.feeType || "未设置费用类型"} · 应收{" "}
                      {money(r.fee)} · 欠款{" "}
                      {money(
                        Math.max(
                          0,
                          r.fee -
                            paidFor(r) +
                            (editingPaymentId && r.docId === formPayment.docId
                              ? (payments.find((p) => p.id === editingPaymentId)
                                  ?.amount ?? 0)
                              : 0),
                        ),
                      )}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              收款时间
              <input
                type="date"
                value={formPayment.paymentDate}
                onChange={(e) =>
                  setFormPayment({
                    ...formPayment,
                    paymentDate: e.target.value,
                  })
                }
              />
            </label>
            <label>
              收款方式
              <select
                required
                value={formPayment.method}
                onChange={(e) =>
                  setFormPayment({ ...formPayment, method: e.target.value })
                }
              >
                <option value="">请选择</option>
                <option>银行转账</option>
                <option>微信支付</option>
                <option>支付宝</option>
                <option>现金</option>
              </select>
            </label>
            <label>
              收款金额（元）
              <input
                type="number"
                min="0"
                value={formPayment.amount}
                onChange={(e) =>
                  setFormPayment({ ...formPayment, amount: e.target.value })
                }
              />
            </label>
            <label>
              修改预计支付时间
              <input
                type="date"
                value={formPayment.expectedPaymentDate}
                onChange={(e) =>
                  setFormPayment((current) => ({
                    ...current,
                    expectedPaymentDate: e.target.value,
                  }))
                }
              />
            </label>
            <label className="full">
              备注信息
              <textarea
                rows={3}
                value={formPayment.note}
                onChange={(e) =>
                  setFormPayment({ ...formPayment, note: e.target.value })
                }
                placeholder="填写本次收款备注"
              />
            </label>
            <AttachmentPanel
              note="回款凭证必填，选中后立即上传"
              inputRef={paymentAttachmentInput}
              savedAttachments={savedPaymentAttachments}
              pendingAttachments={pendingPaymentAttachments}
              onChange={handlePaymentAttachments}
              onRemoveSaved={removeSavedPaymentAttachment}
              onRemovePending={removePendingPaymentAttachment}
            />
          </div>
          <div className="modal-actions">
            <button
              className="secondary-btn"
              onClick={closePaymentModal}
              disabled={paymentSaving}
            >
              取消
            </button>
            <button
              className="primary-btn"
              onClick={savePayment}
              disabled={
                paymentSaving ||
                pendingPaymentAttachments.length > 0 ||
                (editingPaymentId ? !canEditPaymentRecord : !canCreatePayment)
              }
            >
              <Check size={16} />
              {paymentSaving
                ? "正在保存"
                : editingPaymentId
                  ? "保存回款"
                  : "添加回款"}
            </button>
          </div>
        </Modal>
      )}
      {costModal && (
        <Modal
          title={`${costModal === "new" ? "添加成本费用" : "修改成本费用"} · ${selected?.company ?? ""}`}
          onClose={closeCostModal}
        >
          <div className="form-grid">
            <label className="full">
              费用单据
              <select
                value={formCost.docId}
                onChange={(e) =>
                  setFormCost({ ...formCost, docId: e.target.value })
                }
              >
                {selectedRecords.map((record) => (
                  <option key={record.docId} value={record.docId}>
                    {record.docId} · {record.feeType} · {money(record.fee)}
                  </option>
                ))}
              </select>
            </label>
            <label className="supplier-field">
              <span>供应商</span>
              <input
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="搜索供应商"
                aria-label="搜索供应商"
              />
              <select
                required
                value={formCost.supplier}
                onChange={(e) =>
                  setFormCost({ ...formCost, supplier: e.target.value })
                }
              >
                <option value="">请选择供应商</option>
                {filteredSuppliers.map((supplier) => (
                  <option key={supplier} value={supplier}>
                    {supplier}
                  </option>
                ))}
              </select>
            </label>
            <label>
              报销人
              <select
                required
                value={formCost.reimburser}
                onChange={(e) =>
                  setFormCost({ ...formCost, reimburser: e.target.value })
                }
              >
                <option value="">请选择报销人</option>
                {reimbursers.map((reimburser) => (
                  <option key={reimburser} value={reimburser}>
                    {reimburser}
                  </option>
                ))}
              </select>
            </label>
            <label className="cost-type-field">
              <span>费用类型</span>
              <select
                required
                value={formCost.costType}
                onChange={(e) =>
                  setFormCost({ ...formCost, costType: e.target.value })
                }
              >
                <option value="">请选择费用类型</option>
                {costTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              时间选择
              <input
                type="date"
                value={formCost.createdAt}
                onChange={(e) =>
                  setFormCost({ ...formCost, createdAt: e.target.value })
                }
              />
            </label>
            <label>
              成本费用（元）
              <input
                type="number"
                min="0"
                value={formCost.amount}
                onChange={(e) =>
                  setFormCost({ ...formCost, amount: e.target.value })
                }
              />
            </label>
            <label className="full">
              备注
              <textarea
                rows={3}
                value={formCost.note}
                onChange={(e) =>
                  setFormCost({ ...formCost, note: e.target.value })
                }
                placeholder="填写成本费用说明"
              />
            </label>
            <AttachmentPanel
              note="成本凭证必填，选中后立即上传"
              inputRef={costAttachmentInput}
              savedAttachments={savedCostAttachments}
              pendingAttachments={pendingCostAttachments}
              onChange={handleCostAttachments}
              onRemoveSaved={removeSavedCostAttachment}
              onRemovePending={removePendingCostAttachment}
            />
          </div>
          <div className="calc-box">
            <strong>
              预计利润{" "}
              {money(
                (selectedRecords.find(
                  (record) => record.docId === formCost.docId,
                )?.fee ?? 0) - Number(formCost.amount || 0),
              )}
            </strong>
          </div>
          <div className="modal-actions">
            <button
              className="secondary-btn"
              onClick={closeCostModal}
              disabled={costSaving}
            >
              取消
            </button>
            <button
              className="primary-btn"
              onClick={saveCost}
              disabled={
                costSaving ||
                pendingCostAttachments.length > 0 ||
                (costModal === "new" ? !canCreateCost : !canEditCost)
              }
            >
              <Check size={16} />
              {costSaving ? "正在保存" : "保存成本费用"}
            </button>
          </div>
        </Modal>
      )}
      {customerInfoModal && (
        <Modal
          title={`${editingCustomerInfoId ? "编辑" : "添加"}运维资料 · ${selected?.company ?? ""}`}
          onClose={() => {
            setCustomerInfoModal(false);
            setEditingCustomerInfoId(null);
          }}
        >
          <div className="form-grid">
            <label>
              名称
              <input
                value={formCustomerInfo.name}
                onChange={(e) =>
                  setFormCustomerInfo({
                    ...formCustomerInfo,
                    name: e.target.value,
                  })
                }
                placeholder="例如：合同编号、联系人"
              />
            </label>
            <label className="full">
              备注
              <textarea
                rows={4}
                value={formCustomerInfo.note}
                onChange={(e) =>
                  setFormCustomerInfo({
                    ...formCustomerInfo,
                    note: e.target.value,
                  })
                }
                placeholder="填写运维资料备注"
              />
            </label>
          </div>
          <div className="modal-actions">
            <button
              className="secondary-btn"
              onClick={() => {
                setCustomerInfoModal(false);
                setEditingCustomerInfoId(null);
              }}
            >
              取消
            </button>
            <button
              className="primary-btn"
              onClick={saveCustomerInfo}
              disabled={
                editingCustomerInfoId ? !canEditInfoRecord : !canCreateInfo
              }
            >
              <Check size={16} />
              {editingCustomerInfoId ? "保存修改" : "保存运维资料"}
            </button>
          </div>
        </Modal>
      )}
      {permissionGroupModal && (
        <Modal
          title="角色权限管理"
          onClose={() => {
            setPermissionGroupModal(false);
            setEditingPermissionGroupId(null);
          }}
        >
          <section className="permission-section permission-roles-section">
            <button
              className="permission-section-head"
              onClick={() => setPermissionRolesCollapsed((current) => !current)}
              aria-expanded={!permissionRolesCollapsed}
            >
              <span>
                <ChevronDown size={15} />
                已有角色
              </span>
              <small>{permissionGroups.length} 个角色</small>
            </button>
            {!permissionRolesCollapsed && (
              <div className="group-manager">
                {permissionGroups.map((group) => (
                  <div className="group-row" key={group.id}>
                    <div>
                      <strong>{group.name}</strong>
                      <small className="group-permission-summary">
                        {group.permissions.length} 项权限
                      </small>
                    </div>
                    <div className="group-row-actions">
                      <button
                        className="icon-btn"
                        onClick={() => openPermissionGroupEdit(group)}
                        aria-label={`编辑${group.name}`}
                        title="编辑角色"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={() => removePermissionGroup(group.id)}
                        aria-label={`删除${group.name}`}
                        title="删除角色"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="permission-section permission-add-role-fixed">
            <div className="permission-section-head">
              <span>添加角色</span>
              <small>
                {editingPermissionGroupId ? "修改当前角色" : "新增角色"}
              </small>
            </div>
            <div className="group-add-form">
              <input
                value={permissionGroupName}
                onChange={(e) => setPermissionGroupName(e.target.value)}
                placeholder={
                  editingPermissionGroupId ? "修改角色名称" : "新增角色名称"
                }
              />
              <button
                className={
                  editingPermissionGroupId
                    ? "secondary-btn edit-role-save-hidden"
                    : "secondary-btn"
                }
                onClick={
                  editingPermissionGroupId
                    ? savePermissionGroupEdit
                    : addPermissionGroup
                }
              >
                {editingPermissionGroupId ? (
                  <Check size={15} />
                ) : (
                  <Plus size={15} />
                )}
                {editingPermissionGroupId ? "保存修改" : "添加角色"}
              </button>
            </div>
          </section>
          <section className="permission-section">
            <button
              className="permission-section-head"
              onClick={() =>
                setPermissionChecksCollapsed((current) => !current)
              }
              aria-expanded={!permissionChecksCollapsed}
            >
              <span>
                <ChevronDown size={15} />
                角色可访问板块与标签
              </span>
              <small>{permissionGroupPermissions.length} 项已选</small>
            </button>
            {!permissionChecksCollapsed && (
              <div className="permission-checks">
                {allPermissions
                  .filter(
                    (permission) =>
                      !permissionHierarchy.some((item) =>
                        item.children.includes(permission.key),
                      ),
                  )
                  .map(renderPermissionItem)}
              </div>
            )}
          </section>
          <div className="modal-actions">
            <button
              className="primary-btn"
              onClick={completePermissionGroupModal}
            >
              <Check size={16} />
              完成
            </button>
          </div>
        </Modal>
      )}
      {permissionSaveConfirmOpen && (
        <div
          className="modal-backdrop confirm-backdrop"
          onMouseDown={() => setPermissionSaveConfirmOpen(false)}
        >
          <div
            className="modal confirm-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3>确认保存</h3>
              <button
                className="icon-btn"
                onClick={() => setPermissionSaveConfirmOpen(false)}
                aria-label="关闭确认"
              >
                <X size={18} />
              </button>
            </div>
            <p className="confirm-message">确认保存当前角色的权限修改吗？</p>
            <div className="modal-actions">
              <button
                className="secondary-btn"
                onClick={() => setPermissionSaveConfirmOpen(false)}
              >
                取消
              </button>
              <button
                className="primary-btn"
                onClick={confirmPermissionGroupSave}
              >
                <Check size={16} />
                确认保存
              </button>
            </div>
          </div>
        </div>
      )}
      {userModal && (
        <Modal
          title={`${userModal === "new" ? "添加" : "编辑"}团队成员`}
          onClose={() => setUserModal(null)}
        >
          <div className="form-grid">
            <label>
              姓名
              <input
                value={formUser.name}
                onChange={(e) =>
                  setFormUser({ ...formUser, name: e.target.value })
                }
              />
            </label>
            <label>
              用户名
              <input
                value={formUser.username}
                onChange={(e) =>
                  setFormUser({ ...formUser, username: e.target.value })
                }
              />
            </label>
            <label>
              邮箱
              <input
                type="email"
                value={formUser.email}
                onChange={(e) =>
                  setFormUser({ ...formUser, email: e.target.value })
                }
              />
            </label>
            <label>
              手机号
              <input
                value={formUser.phone}
                onChange={(e) =>
                  setFormUser({ ...formUser, phone: e.target.value })
                }
              />
            </label>
            <label>
              角色
              <select
                value={formUser.role}
                onChange={(e) =>
                  setFormUser({ ...formUser, role: e.target.value as Role })
                }
              >
                {permissionGroups.map((group) => (
                  <option key={group.id} value={group.name}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            {userModal === "new" && (
              <label className="password-change-option">
                <span>首次登录时要求修改密码</span>
                <input
                  type="checkbox"
                  checked={mustChangeOnFirstLogin}
                  onChange={(e) => setMustChangeOnFirstLogin(e.target.checked)}
                />
                <i />
              </label>
            )}
          </div>
          <div className="modal-actions">
            <button
              className="secondary-btn"
              onClick={() => setUserModal(null)}
            >
              取消
            </button>
            <button className="primary-btn" onClick={saveUser}>
              <Check size={16} />
              {userModal === "new" ? "添加成员" : "保存修改"}
            </button>
          </div>
        </Modal>
      )}
      {passwordModal && session && (
        <Modal
          title={session.mustChangePassword ? "首次登录修改密码" : "修改密码"}
          onClose={() => {
            if (!session.mustChangePassword) setPasswordModal(false);
          }}
        >
          {session.mustChangePassword && (
            <div className="permission-note">
              <ShieldCheck size={18} />
              <div>
                <strong>请先设置新密码</strong>
                <span>
                  首次登录或管理员重置密码后，需要修改密码才能继续使用。
                </span>
              </div>
            </div>
          )}
          <div className="form-grid">
            <label>
              新密码
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少8位，至少三类字符"
              />
            </label>
            <label>
              确认新密码
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button className="primary-btn" onClick={saveOwnPassword}>
              <Check size={16} />
              保存新密码
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
