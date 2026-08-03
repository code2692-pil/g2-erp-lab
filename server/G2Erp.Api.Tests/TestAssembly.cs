using Xunit;

// InMemory repositories intentionally preserve process-wide sample state.
// API test classes must not seed/cleanup those static stores concurrently.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
