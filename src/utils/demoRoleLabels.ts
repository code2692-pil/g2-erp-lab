export type DemoRole = "Viewer" | "Operator" | "Manager" | "Admin";

export const demoRoleLabels: Readonly<Record<DemoRole, string>> = {
  Viewer: "조회 사용자",
  Operator: "일반 사용자",
  Manager: "일반 관리자",
  Admin: "시스템 관리자"
};

export const demoRoleDescriptions: Readonly<Record<DemoRole, string>> = {
  Viewer: "업무 데이터를 조회하고 내용을 확인합니다.",
  Operator: "수주·발주·작업지시를 등록하고 처리합니다.",
  Manager: "업무 처리와 관리 기능을 함께 사용합니다.",
  Admin: "사용자와 시스템 관리 기능을 포함해 사용합니다."
};
