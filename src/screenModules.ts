import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export type ScreenModuleId = "purchase" | "work" | "development" | "ai" | "mobileSales" | "pdaSales";

interface ScreenModule<TComponent extends ComponentType<any>> {
  component: LazyExoticComponent<TComponent>;
  preload: () => Promise<void>;
}

function createScreenModule<TComponent extends ComponentType<any>>(importModule: () => Promise<{ default: TComponent }>): ScreenModule<TComponent> {
  let currentLoad: Promise<{ default: TComponent }> | undefined;

  const load = () => {
    if (!currentLoad) {
      currentLoad = importModule().catch((error) => {
        currentLoad = undefined;
        throw error;
      });
    }
    return currentLoad;
  };

  return {
    component: lazy(load),
    preload: async () => { await load(); }
  };
}

const purchaseOrderScreen = createScreenModule(() => import("./features/purchase-order/PurchaseOrderRegistration").then(({ PurchaseOrderRegistration }) => ({ default: PurchaseOrderRegistration })));
const workOrderScreen = createScreenModule(() => import("./features/work-order/WorkOrderRegistration").then(({ WorkOrderRegistration }) => ({ default: WorkOrderRegistration })));
const developmentDataScreen = createScreenModule(() => import("./features/development-data/DevelopmentDataManager").then(({ DevelopmentDataManager }) => ({ default: DevelopmentDataManager })));
const aiSolutionCenterScreen = createScreenModule(() => import("./features/ai-solution-center/AiSolutionCenterPage").then(({ AiSolutionCenterPage }) => ({ default: AiSolutionCenterPage })));
const compactSalesScreen = createScreenModule(() => import("./features/sales-order/CompactSalesOrderPage").then(({ CompactSalesOrderPage }) => ({ default: CompactSalesOrderPage })));

export const screenModules = {
  purchase: purchaseOrderScreen,
  work: workOrderScreen,
  development: developmentDataScreen,
  ai: aiSolutionCenterScreen,
  mobileSales: compactSalesScreen,
  pdaSales: compactSalesScreen
};

export function preloadScreenModule(screen: ScreenModuleId) {
  return screenModules[screen].preload();
}
