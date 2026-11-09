Feature: huge step arguments

  Scenario: huge multiline parameter
    When huge multiline step with 10 lines
      """
      line 1: the quick brown fox jumps over the lazy dog | "quoted" 'single' {braces} <angle> ✓
      line 2: the quick brown fox jumps over the lazy dog | "quoted" 'single' {braces} <angle> ✓
      line 3: the quick brown fox jumps over the lazy dog | "quoted" 'single' {braces} <angle> ✓
      line 4: the quick brown fox jumps over the lazy dog | "quoted" 'single' {braces} <angle> ✓
      line 5: the quick brown fox jumps over the lazy dog | "quoted" 'single' {braces} <angle> ✓
      line 6: the quick brown fox jumps over the lazy dog | "quoted" 'single' {braces} <angle> ✓
      line 7: the quick brown fox jumps over the lazy dog | "quoted" 'single' {braces} <angle> ✓
      line 8: the quick brown fox jumps over the lazy dog | "quoted" 'single' {braces} <angle> ✓
      line 9: the quick brown fox jumps over the lazy dog | "quoted" 'single' {braces} <angle> ✓
      line 10: the quick brown fox jumps over the lazy dog | "quoted" 'single' {braces} <angle> ✓
      """

  Scenario: huge data table parameter
    When huge data table step with 9 rows and 5 columns
      | col1 | col2 | col3 | col4 | col5 |
      | r1c1 | r1c2 | r1c3 | r1c4 | r1c5 |
      | r2c1 | r2c2 | r2c3 | r2c4 | r2c5 |
      | r3c1 | r3c2 | r3c3 | r3c4 | r3c5 |
      | r4c1 | r4c2 | r4c3 | r4c4 | r4c5 |
      | r5c1 | r5c2 | r5c3 | r5c4 | r5c5 |
      | r6c1 | r6c2 | r6c3 | r6c4 | r6c5 |
      | r7c1 | r7c2 | r7c3 | r7c4 | r7c5 |
      | r8c1 | r8c2 | r8c3 | r8c4 | r8c5 |
      | r9c1 | r9c2 | r9c3 | r9c4 | r9c5 |

  Scenario: huge parameters passed with executeStep
    When huge arguments via execute step

  Scenario: huge parameters passed with Template
    When huge arguments via template
