export type FolderId = 'inbox' | 'priority' | 'sent' | 'drafts' | 'archive' | 'trash';

export type MailItem = {
  id: string;
  folder: FolderId;
  fromName: string;
  fromEmail: string;
  to: string[];
  cc?: string[];
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string;
  read: boolean;
  starred: boolean;
  important: boolean;
  labels: string[];
  attachments: { name: string; size: string }[];
  thread: { sender: string; time: string; body: string }[];
};

export type Counts = {
  inbox: number;
  priority: number;
  sent: number;
  drafts: number;
  archive: number;
  trash: number;
};

export const folders: { id: FolderId; label: string; countKey: keyof Counts }[] = [
  { id: 'inbox', label: '收件箱', countKey: 'inbox' },
  { id: 'priority', label: '重点邮件', countKey: 'priority' },
  { id: 'sent', label: '已发送', countKey: 'sent' },
  { id: 'drafts', label: '草稿箱', countKey: 'drafts' },
  { id: 'archive', label: '归档', countKey: 'archive' },
  { id: 'trash', label: '已删除', countKey: 'trash' }
];

export const labels = ['财务', '人事', '安全', '产品', '销售', '运营', '法务', '系统'];

export const seedMails: MailItem[] = [
  {
    id: 'm-001',
    folder: 'priority',
    fromName: '财务共享中心',
    fromEmail: 'finance@yunqiao.local',
    to: ['you@yunqiao.local'],
    subject: '2026 年度预算复核需要确认',
    snippet: '预算口径已完成二次校对，请在今日 18:00 前确认共享云盘中的附件。',
    body:
      '各部门好，\n\n2026 年度预算复核表已更新至共享空间。请重点核对市场、研发与行政条目，若有调整建议，请直接在批注列补充说明。\n\n财务部将在 18:30 前汇总最终版本并提交流程。\n\n谢谢。',
    receivedAt: '2026-08-14T08:20:00',
    read: false,
    starred: true,
    important: true,
    labels: ['财务', '流程'],
    attachments: [
      { name: '预算复核表.xlsx', size: '1.2 MB' },
      { name: '口径说明.pdf', size: '860 KB' }
    ],
    thread: [
      { sender: '财务共享中心', time: '08:20', body: '预算复核表已同步，请在今日内确认最新版本。' },
      { sender: '你', time: '08:33', body: '收到，已安排部门负责人复核。' }
    ]
  },
  {
    id: 'm-002',
    folder: 'inbox',
    fromName: '人力资源部',
    fromEmail: 'hr@yunqiao.local',
    to: ['you@yunqiao.local'],
    subject: '新员工入职包已更新',
    snippet: '本周入职名单已确认，欢迎页、权限申请和培训安排都已整理到同一页面。',
    body:
      '你好，\n\n本周新员工入职包已更新，内容包括欢迎页、设备申请、账号开通和培训日程。\n\n如需补充某个团队的特殊权限，请直接回复此邮件，我们会统一处理。',
    receivedAt: '2026-08-14T09:05:00',
    read: false,
    starred: false,
    important: false,
    labels: ['人事'],
    attachments: [{ name: '入职清单.docx', size: '420 KB' }],
    thread: [{ sender: '人力资源部', time: '09:05', body: '本周入职包已更新，请查收。' }]
  },
  {
    id: 'm-003',
    folder: 'inbox',
    fromName: '安全运维组',
    fromEmail: 'secops@yunqiao.local',
    to: ['you@yunqiao.local'],
    subject: '终端策略升级窗口确认',
    snippet: '统一策略将在今晚 22:00 进入灰度，请提前通知受影响的两组用户。',
    body:
      '各位同事，\n\n终端策略升级窗口定于今晚 22:00-23:00。\n灰度名单中的两组用户会收到重启提醒，请协助通知。\n\n升级期间邮件服务保持在线，不影响外发和收件。',
    receivedAt: '2026-08-14T09:48:00',
    read: true,
    starred: false,
    important: true,
    labels: ['安全', '系统'],
    attachments: [],
    thread: [{ sender: '安全运维组', time: '09:48', body: '请确认今晚升级窗口及灰度名单。' }]
  },
  {
    id: 'm-004',
    folder: 'inbox',
    fromName: '产品委员会',
    fromEmail: 'product@yunqiao.local',
    to: ['you@yunqiao.local'],
    subject: '月度版本回顾材料收口',
    snippet: '本月回顾会延后 30 分钟，新增了客户反馈与数据看板两个议题。',
    body:
      '大家好，\n\n月度版本回顾材料已收口，新增客户反馈摘要与数据看板趋势说明。\n请确认你负责的模块是否需要补充一页状态说明。\n\n会议时间顺延到 16:30。',
    receivedAt: '2026-08-13T16:10:00',
    read: true,
    starred: true,
    important: false,
    labels: ['产品'],
    attachments: [
      { name: '回顾材料.pptx', size: '5.4 MB' },
      { name: '客户反馈汇总.csv', size: '96 KB' }
    ],
    thread: [{ sender: '产品委员会', time: '16:10', body: '请确认版本回顾材料最终版。' }]
  },
  {
    id: 'm-005',
    folder: 'sent',
    fromName: '你',
    fromEmail: 'you@yunqiao.local',
    to: ['sales@contoso.local'],
    subject: '项目资料包已发送',
    snippet: '附件里包含最新报价、接入说明和联系人名单。',
    body:
      '您好，\n\n项目资料包已经发送，里面包含最新报价、接入说明以及联系人名单。\n如有需要，我们可以安排一次 30 分钟的方案说明会。',
    receivedAt: '2026-08-13T14:15:00',
    read: true,
    starred: false,
    important: false,
    labels: ['销售'],
    attachments: [{ name: '项目资料包.zip', size: '12.8 MB' }],
    thread: [{ sender: '你', time: '14:15', body: '项目资料包已发送。' }]
  },
  {
    id: 'm-006',
    folder: 'drafts',
    fromName: '你',
    fromEmail: 'you@yunqiao.local',
    to: ['legal@yunqiao.local'],
    subject: '合同条款补充说明',
    snippet: '待补充附件与审批链节点。',
    body: '你好，\n\n关于合同条款的补充说明我已经整理了草稿，稍后补充附件后发送。',
    receivedAt: '2026-08-13T19:40:00',
    read: true,
    starred: false,
    important: false,
    labels: ['法务'],
    attachments: [],
    thread: [{ sender: '你', time: '19:40', body: '合同条款补充说明草稿。' }]
  },
  {
    id: 'm-007',
    folder: 'archive',
    fromName: '运营中台',
    fromEmail: 'ops@yunqiao.local',
    to: ['you@yunqiao.local'],
    subject: '机房巡检结果已归档',
    snippet: '巡检全部通过，日志已移交到审计库。',
    body: '本次机房巡检结果已归档，全部设备在线，温湿度指标正常，告警清零。',
    receivedAt: '2026-08-12T11:00:00',
    read: true,
    starred: false,
    important: false,
    labels: ['运营', '系统'],
    attachments: [{ name: '巡检报告.pdf', size: '1.9 MB' }],
    thread: [{ sender: '运营中台', time: '11:00', body: '机房巡检结果已归档。' }]
  },
  {
    id: 'm-008',
    folder: 'trash',
    fromName: '外部服务商',
    fromEmail: 'vendor@external.local',
    to: ['you@yunqiao.local'],
    subject: '报价单已过期',
    snippet: '请忽略旧版本报价，新的报价单会在本周内重新发送。',
    body: '旧版本报价单已过期，请忽略。',
    receivedAt: '2026-08-11T10:25:00',
    read: true,
    starred: false,
    important: false,
    labels: ['销售'],
    attachments: [],
    thread: [{ sender: '外部服务商', time: '10:25', body: '旧版本报价单已过期。' }]
  }
];

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  status: 'active' | 'suspended';
  quota: string;
  lastLogin: string;
};

export const seedAdminUsers: AdminUser[] = [
  { id: 'u-001', name: '林若川', email: 'lin.ruochuan@yunqiao.local', department: '产品委员会', role: '超级管理员', status: 'active', quota: '18.4 GB / 50 GB', lastLogin: '今天 09:42' },
  { id: 'u-002', name: '周以宁', email: 'zhou.yining@yunqiao.local', department: '财务共享中心', role: '部门管理员', status: 'active', quota: '8.2 GB / 20 GB', lastLogin: '今天 08:57' },
  { id: 'u-003', name: '顾成安', email: 'gu.chengan@yunqiao.local', department: '安全运维组', role: '普通用户', status: 'active', quota: '6.1 GB / 20 GB', lastLogin: '昨天 21:12' },
  { id: 'u-004', name: '沈知遥', email: 'shen.zhiyao@yunqiao.local', department: '人力资源部', role: '普通用户', status: 'active', quota: '3.8 GB / 20 GB', lastLogin: '昨天 18:04' },
  { id: 'u-005', name: '唐子墨', email: 'tang.zimo@yunqiao.local', department: '销售中心', role: '普通用户', status: 'suspended', quota: '12.7 GB / 20 GB', lastLogin: '08/11 16:30' },
  { id: 'u-006', name: '宋明远', email: 'song.mingyuan@yunqiao.local', department: '运营中台', role: '部门管理员', status: 'active', quota: '9.4 GB / 20 GB', lastLogin: '08/11 10:16' }
];

export const seedAdminDomains = [
  { domain: 'yunqiao.local', status: '已验证', users: 128, mx: 'mx01.yunqiao.local', spf: '通过', dkim: '通过' },
  { domain: 'yunqiao.cn', status: '待验证', users: 0, mx: '未配置', spf: '待处理', dkim: '待处理' }
];

export const seedAuditLogs = [
  { id: 'a-001', action: '修改安全策略', actor: '林若川', target: '外发域名白名单', time: '今天 09:36', tone: 'blue' },
  { id: 'a-002', action: '停用邮箱账号', actor: '周以宁', target: 'tang.zimo@yunqiao.local', time: '昨天 16:30', tone: 'red' },
  { id: 'a-003', action: '新增域名', actor: '林若川', target: 'yunqiao.cn', time: '08/12 14:22', tone: 'green' },
  { id: 'a-004', action: '导出审计报表', actor: '顾成安', target: '2026-08 安全审计', time: '08/12 11:03', tone: 'amber' }
];
