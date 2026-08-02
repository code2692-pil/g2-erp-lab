import { Building2 } from "lucide-react";
import type { ScreenModuleId } from "../screenModules";

export const PRODUCT_NAME = "SMART SNOTES DEMO";

export type AppNavigationPage =
  | "sales"
  | "mobileSales"
  | "mobilePurchase"
  | "mobileWork"
  | "pdaSales"
  | "pdaPurchase"
  | "pdaWork"
  | "purchase"
  | "work"
  | "development"
  | "ai"
  | "aiSystem"
  | "aiQa";

interface AppNavigationProps {
  currentPage: AppNavigationPage;
  onNavigate: (page: AppNavigationPage) => void;
  onScreenIntent?: (screen: ScreenModuleId) => void;
}

interface MenuLeafProps {
  active: boolean;
  label: string;
  onClick: () => void;
  testId: string;
  onIntent?: () => void;
}

function MenuLeaf({ active, label, onClick, testId, onIntent }: MenuLeafProps) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`menu-item menu-leaf${active ? " active" : ""}`}
      data-testid={testId}
      onClick={onClick}
      onFocus={onIntent}
      onMouseEnter={onIntent}
      onPointerDown={onIntent}
      type="button"
    >
      {label}
    </button>
  );
}

export function AppNavigation({ currentPage, onNavigate, onScreenIntent }: AppNavigationProps) {
  const intent = (screen: ScreenModuleId) => () => onScreenIntent?.(screen);
  const leaf = (page: AppNavigationPage, label: string, testId: string, screen?: ScreenModuleId) => (
    <MenuLeaf
      active={currentPage === page || (page === "ai" && currentPage === "ai")}
      label={label}
      onClick={() => onNavigate(page)}
      onIntent={screen ? intent(screen) : undefined}
      testId={testId}
    />
  );

  return (
    <aside className="side-nav" data-testid="app-navigation">
      <div className="brand" aria-label={PRODUCT_NAME}>
        <Building2 aria-hidden="true" size={20} />
        <strong>{PRODUCT_NAME}</strong>
      </div>
      <nav aria-label="업무 메뉴">
        <section className="menu-tree-section" data-menu-root="영업관리">
          <h2 className="menu-title">영업관리</h2>
          <div className="menu-group">수주관리</div>
          {leaf("sales", "수주등록", "nav-sales-order")}
        </section>
        <section className="menu-tree-section" data-menu-root="구매관리">
          <h2 className="menu-title">구매관리</h2>
          <div className="menu-group">발주관리</div>
          {leaf("purchase", "발주등록", "nav-purchase-order", "purchase")}
        </section>
        <section className="menu-tree-section" data-menu-root="생산관리">
          <h2 className="menu-title">생산관리</h2>
          <div className="menu-group">작업지시</div>
          {leaf("work", "작업지시등록", "nav-work-order", "work")}
        </section>
        <section className="menu-tree-section" data-menu-root="시스템관리">
          <h2 className="menu-title">시스템관리</h2>
          <div className="menu-group">AI 관리</div>
          {leaf("aiSystem", "AI 시스템 관리", "nav-ai-system-management", "ai")}
          {leaf("ai", "AI 솔루션 센터", "nav-ai-solution-center", "ai")}
          {leaf("aiQa", "AI Q&A", "nav-ai-qa", "ai")}
        </section>
        <section className="menu-tree-section menu-tree-platform" data-menu-root="모바일">
          <h2 className="menu-title">모바일</h2>
          <div className="menu-group">영업관리</div>
          <div className="menu-subgroup">수주관리</div>
          {leaf("mobileSales", "수주등록", "nav-mobile-sales-order", "mobileSales")}
          <div className="menu-group">구매관리</div>
          <div className="menu-subgroup">발주관리</div>
          {leaf("mobilePurchase", "발주등록", "nav-mobile-purchase-order", "purchase")}
          <div className="menu-group">생산관리</div>
          <div className="menu-subgroup">작업지시</div>
          {leaf("mobileWork", "작업지시등록", "nav-mobile-work-order", "work")}
        </section>
        <section className="menu-tree-section menu-tree-platform" data-menu-root="PDA">
          <h2 className="menu-title">PDA</h2>
          <div className="menu-group">영업관리</div>
          <div className="menu-subgroup">수주관리</div>
          {leaf("pdaSales", "수주등록", "nav-pda-sales-order", "pdaSales")}
          <div className="menu-group">구매관리</div>
          <div className="menu-subgroup">발주관리</div>
          {leaf("pdaPurchase", "발주등록", "nav-pda-purchase-order", "purchase")}
          <div className="menu-group">생산관리</div>
          <div className="menu-subgroup">작업지시</div>
          {leaf("pdaWork", "작업지시등록", "nav-pda-work-order", "work")}
        </section>
      </nav>
    </aside>
  );
}
