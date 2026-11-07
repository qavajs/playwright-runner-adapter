Feature: cucumber compatibility

  Scenario: require modules
    Then require module is loaded

  Scenario: world parameters
    Then world parameter 'baseUrl' is 'https://example.com'

  Scenario: attach with media type string
    When attach with media type string
    Then attachment 'attachment' has content type 'application/json'

  Scenario: attach base64
    When attach base64 'aGVsbG8=' as 'text/plain;base64'
    Then attachment 'attachment' has body 'hello'

  Scenario: log is attached to report
    When log 'logged text'
    Then attachment 'log' has body 'logged text'

  @statusCheck(PENDING) @fail()
  Scenario: pending step fails in strict mode
    When pending step
    Then fail

  @statusCheck(SKIPPED)
  Scenario: skipped step skips scenario
    When skipped step
    Then fail

  @statusCheck(FAILED) @failInBefore @fail()
  Scenario: after hook receives failed status when before hook fails
    When simple step

  @statusCheck(UNDEFINED) @fail()
  Scenario: undefined step
    When this step is not defined

  @excludedByConfig
  Scenario: excluded by tags config
    When fail

  Scenario: execute step with data table and doc string
    When execute step with arguments

  Scenario: template with data table and doc string
    When template with arguments

  Scenario: test location points to feature file
    Then test location is line 49 of 'compatibility.feature'

  @statusCheck(FAILED) @messageCheck(timed-out) @fail()
  Scenario: step timeout option
    When step that takes 500 ms with 100 ms timeout

  @statusCheck(FAILED) @messageCheck(timed-out) @fail() @slowBeforeHook
  Scenario: hook timeout option
    When simple step

  Scenario: default timeout is applied only when set explicitly
    Then default timeout is 20000
