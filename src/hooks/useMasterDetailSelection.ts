import { useCallback, useState } from "react";

export function useMasterDetailSelection<TMasterKey, TDetailKey>(
  initialMasterKey: TMasterKey,
  initialDetailKey: TDetailKey
) {
  const [selectedMasterKey, setSelectedMasterKey] = useState(initialMasterKey);
  const [selectedDetailKey, setSelectedDetailKey] = useState(initialDetailKey);

  const selectMaster = useCallback(
    (masterKey: TMasterKey) => {
      setSelectedMasterKey(masterKey);
      setSelectedDetailKey(initialDetailKey);
    },
    [initialDetailKey]
  );

  const selectDetail = useCallback((detailKey: TDetailKey) => {
    setSelectedDetailKey(detailKey);
  }, []);

  return {
    selectedMasterKey,
    selectedDetailKey,
    selectMaster,
    selectDetail
  };
}
