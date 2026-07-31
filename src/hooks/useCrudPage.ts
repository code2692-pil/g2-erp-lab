import { useCallback, useEffect, useRef, useState } from "react";

export type CrudOperation = "idle" | "querying" | "saving" | "deleting";

export interface CrudActionOptions<TResult> {
  execute: (signal?: AbortSignal) => TResult | Promise<TResult>;
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

function isAbortError(error: unknown) {
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

/**
 * Keeps mutations first-wins while allowing a newer query to replace an older
 * query result. The sequence check remains effective even when a transport
 * cannot be cancelled.
 */
export function useCrudPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [operation, setOperation] = useState<CrudOperation>("idle");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [featureMessage, setFeatureMessage] = useState("");
  const mountedRef = useRef(true);
  const mutationInFlightRef = useRef(false);
  const queryInFlightRef = useRef(false);
  const queryAbortControllerRef = useRef<AbortController | null>(null);
  const latestQuerySequenceRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queryAbortControllerRef.current?.abort();
    };
  }, []);

  const updateIfMounted = useCallback((update: () => void) => {
    if (mountedRef.current) update();
  }, []);

  const clearMessage = useCallback(() => {
    updateIfMounted(() => {
      setError(null);
      setSuccessMessage(null);
    });
  }, [updateIfMounted]);

  const setMessage = useCallback((message: string) => {
    clearMessage();
    updateIfMounted(() => setFeatureMessage(message));
  }, [clearMessage, updateIfMounted]);

  const message = error ?? successMessage ?? featureMessage;

  const runMutation = useCallback(
    async <TResult>(
      options: CrudActionOptions<TResult>,
      nextOperation: Extract<CrudOperation, "saving" | "deleting">,
      fallbackSuccessMessage: string
    ): Promise<TResult | undefined> => {
      if (mutationInFlightRef.current || queryInFlightRef.current) return undefined;

      mutationInFlightRef.current = true;
      clearMessage();
      updateIfMounted(() => {
        setIsSaving(true);
        setOperation(nextOperation);
      });

      try {
        if (options.validate && !(await options.validate())) return undefined;
        const result = await options.execute();
        if (mountedRef.current) {
          options.onSuccess?.(result);
          setSuccessMessage(resolveMessage(options.successMessage, result, fallbackSuccessMessage));
        }
        return result;
      } catch (caughtError) {
        if (mountedRef.current && !isAbortError(caughtError)) {
          setError(resolveMessage(options.errorMessage, caughtError, toErrorMessage(caughtError)));
          options.onError?.(caughtError);
        }
        return undefined;
      } finally {
        mutationInFlightRef.current = false;
        updateIfMounted(() => {
          setIsSaving(false);
          setOperation("idle");
        });
      }
    },
    [clearMessage, updateIfMounted]
  );

  const executeSearch = useCallback(
    async <TResult>(options: CrudActionOptions<TResult>): Promise<TResult | undefined> => {
      if (mutationInFlightRef.current) return undefined;

      queryAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      queryAbortControllerRef.current = abortController;
      const requestSequence = ++latestQuerySequenceRef.current;
      queryInFlightRef.current = true;
      clearMessage();
      updateIfMounted(() => {
        setIsLoading(true);
        setOperation("querying");
      });

      try {
        const result = await options.execute(abortController.signal);
        if (mountedRef.current && requestSequence === latestQuerySequenceRef.current) {
          options.onSuccess?.(result);
          setSuccessMessage(resolveMessage(options.successMessage, result, "조회되었습니다."));
        }
        return requestSequence === latestQuerySequenceRef.current ? result : undefined;
      } catch (caughtError) {
        if (mountedRef.current && requestSequence === latestQuerySequenceRef.current && !isAbortError(caughtError)) {
          setError(resolveMessage(options.errorMessage, caughtError, toErrorMessage(caughtError)));
          options.onError?.(caughtError);
        }
        return undefined;
      } finally {
        if (requestSequence === latestQuerySequenceRef.current) {
          queryInFlightRef.current = false;
          queryAbortControllerRef.current = null;
          updateIfMounted(() => {
            setIsLoading(false);
            setOperation("idle");
          });
        }
      }
    },
    [clearMessage, updateIfMounted]
  );

  const executeCreate = useCallback(
    <TResult>(options: CrudActionOptions<TResult>) => runMutation(options, "saving", "신규 행이 추가되었습니다."),
    [runMutation]
  );
  const executeSave = useCallback(
    <TResult>(options: CrudActionOptions<TResult>) => runMutation(options, "saving", "저장되었습니다."),
    [runMutation]
  );
  const executeDelete = useCallback(
    <TResult>(options: CrudActionOptions<TResult>) => runMutation(options, "deleting", "삭제되었습니다."),
    [runMutation]
  );

  return {
    isLoading,
    isSaving,
    isProcessing: isLoading || isSaving,
    operation,
    error,
    successMessage,
    message,
    clearMessage,
    setMessage,
    setFeatureMessage,
    executeSearch,
    executeCreate,
    executeSave,
    executeDelete
  };
}
