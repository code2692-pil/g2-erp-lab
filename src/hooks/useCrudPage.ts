import { useCallback, useState } from "react";

export interface CrudActionOptions<TResult> {
  execute: () => TResult | Promise<TResult>;
  validate?: () => boolean | Promise<boolean>;
  onSuccess?: (result: TResult) => void;
  onError?: (error: unknown) => void;
  successMessage?: string | ((result: TResult) => string);
  errorMessage?: string | ((error: unknown) => string);
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function resolveMessage<TResult>(
  message: string | ((value: TResult) => string) | undefined,
  value: TResult,
  fallback: string
) {
  return typeof message === "function" ? message(value) : message ?? fallback;
}

export function useCrudPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearMessage = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
  }, []);

  const runAction = useCallback(
    async <TResult>(
      options: CrudActionOptions<TResult>,
      setPending: (pending: boolean) => void,
      fallbackSuccessMessage: string
    ): Promise<TResult | undefined> => {
      clearMessage();

      if (options.validate && !(await options.validate())) return undefined;

      setPending(true);
      try {
        const result = await options.execute();
        options.onSuccess?.(result);
        setSuccessMessage(resolveMessage(options.successMessage, result, fallbackSuccessMessage));
        return result;
      } catch (caughtError) {
        const message = resolveMessage(options.errorMessage, caughtError, toErrorMessage(caughtError));
        setError(message);
        options.onError?.(caughtError);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [clearMessage]
  );

  const executeSearch = useCallback(
    <TResult>(options: CrudActionOptions<TResult>) => runAction(options, setIsLoading, "조회되었습니다."),
    [runAction]
  );
  const executeCreate = useCallback(
    <TResult>(options: CrudActionOptions<TResult>) => runAction(options, setIsSaving, "신규 행이 추가되었습니다."),
    [runAction]
  );
  const executeSave = useCallback(
    <TResult>(options: CrudActionOptions<TResult>) => runAction(options, setIsSaving, "저장되었습니다."),
    [runAction]
  );
  const executeDelete = useCallback(
    <TResult>(options: CrudActionOptions<TResult>) => runAction(options, setIsSaving, "삭제되었습니다."),
    [runAction]
  );

  return {
    isLoading,
    isSaving,
    error,
    successMessage,
    clearMessage,
    executeSearch,
    executeCreate,
    executeSave,
    executeDelete
  };
}
