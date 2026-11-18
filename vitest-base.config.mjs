export default {
  test: {
    coverage: {
      provider: 'istanbul',
      reportsDirectory: 'coverage',
      reporter: ['html', 'text', 'text-summary', 'lcov'],
    },
  },
};

