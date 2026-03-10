# Example Conversations

Real-world use cases for the Blanket AI Assistant.

---

## Example 1: Bulk Template Update

**User:**
> Add a beer cooler temperature check (34-38°F) to all bar opening checklists

**AI:**
> I found 8 templates with "bar" and "opening" in the name:
> 1. Bar Opening Checklist (Postino East)
> 2. Bar Opening Checklist (Postino Arcadia)
> 3. Bar Opening Checklist (Postino Central)
> ... (5 more)
> 
> I'll add a new temperature task:
> - **Name:** Beer cooler temperature
> - **Type:** temperature
> - **Range:** 34-38°F
> - **Critical:** Yes (fail if out of range)
> - **Required:** Yes
> 
> Where should I add this task?
> a) At the beginning
> b) After "Soda gun nozzle clean" task
> c) At the end

**User:**
> After the soda gun task

**AI:**
> Perfect. Here's a preview of changes for "Bar Opening Checklist (Postino East)":
> 
> ```
> [Existing tasks...]
> 5. Soda gun nozzle & holster clean (yesNo)
> 6. Beer cooler temperature (temperature) ← NEW
>    - Min: 34°F
>    - Max: 38°F
>    - Critical: Yes
> 7. POS systems dusted (yesNo)
> [...]
> ```
> 
> Apply this change to all 8 templates? (Yes/No)

**User:**
> Yes

**AI:**
> ✅ Updated 8 templates successfully. Changes are live.
> 
> **Summary:**
> - Templates modified: 8
> - Task added: "Beer cooler temperature" (temperature type)
> - Position: After "Soda gun nozzle clean"
> - Critical flag: Yes
> 
> [View templates in Blanket →]

---

## Example 2: Performance Analytics

**User:**
> Which locations had the lowest completion rates last week?

**AI:**
> Analyzing completion rates for March 3-9, 2026...
> 
> **Bottom 5 Locations (sorted by completion rate):**
> 
> | Location | Completed | Total | Rate |
> |----------|-----------|-------|------|
> | Downtown Phoenix | 43 | 69 | 62% |
> | Tempe Mill Ave | 51 | 75 | 68% |
> | Scottsdale Old Town | 38 | 53 | 71% |
> | Mesa Gilbert Rd | 47 | 63 | 74% |
> | Chandler Fashion | 52 | 67 | 78% |
> 
> **Organization Average:** 85%
> 
> **Notable:** Downtown Phoenix is 23 percentage points below average. Would you like me to investigate why?

**User:**
> Yes, investigate Downtown

**AI:**
> Analyzing Downtown Phoenix performance...
> 
> **Findings:**
> - **Incomplete lists:** 26 started but not completed
> - **Most abandoned template:** "Bar Opening Checklist" (12 incomplete)
> - **Primary performer:** Sarah Martinez (9 incomplete)
> - **Time pattern:** Abandons happen between 10-11 AM
> - **Hypothesis:** Likely interrupted by customer rush (opening time)
> 
> **Suggested Actions:**
> 1. Talk to Sarah about barriers to completion
> 2. Consider splitting "Bar Opening" into 2 shorter checklists (before/after rush)
> 3. Send reminder notifications for incomplete lists
> 4. Adjust expected completion time from 30 min → 45 min
> 
> Would you like me to:
> a) Send a notification to Sarah's manager
> b) Generate a detailed report
> c) Compare to other locations with similar patterns

---

## Example 3: Food Safety (Marco Pollo)

**User:**
> What temperature should we hold cooked pasta at?

**AI:**
> Let me consult Marco Pollo (food safety expert)...
> 
> **Answer (FDA Guidelines):**
> Cooked pasta (and all hot foods) must be held at **135°F or above** to prevent bacterial growth.
> 
> **Details:**
> - **Safe holding:** Above 135°F for up to 4 hours
> - **Danger zone:** 40-135°F (bacteria multiply rapidly)
> - **Best practices:**
>   - Use steam tables, heat lamps, or warming drawers
>   - Check temp every 2 hours
>   - Discard if below 135°F for >2 hours
> 
> **Citation:** FDA Food Code 3-501.16
> 
> ---
> 
> **Recommendation:** Add a "Pasta holding temperature" check to your kitchen checklists with a critical alert if temp drops below 135°F.
> 
> Would you like me to add this task to your templates?

**User:**
> Yes, add to all kitchen closing checklists

**AI:**
> Adding "Pasta holding temperature" task...
> 
> **Task Details:**
> - **Name:** Pasta station holding temperature
> - **Type:** temperature
> - **Min:** 135°F
> - **Max:** 180°F (above this indicates potential scorching)
> - **Critical:** Yes (fail if out of range)
> - **Description:** "Verify pasta station holding temp (FDA requirement: ≥135°F)"
> 
> Found 6 kitchen closing checklists. Here's how it will look:
> 
> ```
> [Existing tasks...]
> 12. Check all food storage temps (temperature)
> 13. Pasta station holding temperature (temperature) ← NEW
>     - Range: 135-180°F
>     - Critical: Yes
> 14. Manager sign-off (signature)
> [...]
> ```
> 
> Confirm addition to all 6 templates? (Yes/No)

---

## Example 4: Template Creation

**User:**
> Create a new kitchen morning prep checklist with tasks for: equipment setup, oven check, mise en place, walk-in cooler temp, and chef signature

**AI:**
> Creating "Kitchen Morning Prep Checklist"...
> 
> **Template Structure:**
> 
> **Section 1: Equipment & Setup**
> 1. Prep station setup complete (checkMark)
>    - Required: Yes
> 
> 2. All ovens functioning properly (yesNo)
>    - Required: Yes
>    - Fail condition: "No"
> 
> **Section 2: Food Preparation**
> 3. Mise en place stocked and fresh (yesNo)
>    - Description: "Verify all prep containers are filled and ingredients are fresh"
>    - Required: Yes
>    - Fail condition: "No"
> 
> **Section 3: Temperature Checks**
> 4. Walk-in cooler temperature (temperature)
>    - Range: 34-38°F
>    - Critical: Yes
>    - Required: Yes
> 
> **Section 4: Approval**
> 5. Chef signature - prep approved (signature)
>    - Required: Yes
> 
> ---
> 
> **Estimated Duration:** 15 minutes
> **Status:** DRAFT (you can review before publishing)
> 
> Proceed with creation? (Yes/Edit/Cancel)

**User:**
> Yes

**AI:**
> ✅ Template created successfully!
> 
> **Name:** Kitchen Morning Prep Checklist
> **Tasks:** 5 (across 4 sections)
> **Status:** DRAFT
> **ID:** `abc123-uuid`
> 
> **Next Steps:**
> 1. Review in Blanket list builder
> 2. Assign to locations (which kitchens?)
> 3. Set schedule (daily at 7 AM?)
> 4. Publish when ready
> 
> [Open in list builder →]

---

## Example 5: Issue Investigation

**User:**
> Why is the Scottsdale location failing so many cooler temperature checks?

**AI:**
> Analyzing Scottsdale location cooler temperature failures...
> 
> **Timeframe:** Last 30 days
> **Total checks:** 89
> **Failed checks:** 23 (26% failure rate)
> 
> **Pattern Analysis:**
> 
> **1. Which cooler?**
> - Walk-in cooler: 18 failures (78% of failures)
> - Under-counter cooler: 5 failures (22%)
> 
> **2. Temperature range:**
> - Below 34°F: 3 instances (too cold)
> - Above 38°F: 20 instances (too warm) ← PRIMARY ISSUE
> - Average failed temp: 42°F (4° above max)
> 
> **3. Time pattern:**
> - Morning (6-9 AM): 2 failures
> - Midday (11 AM - 2 PM): 15 failures ← PEAK
> - Evening (5-8 PM): 6 failures
> 
> **4. Day of week:**
> - Weekdays: 12 failures
> - Weekends (Sat/Sun): 11 failures
> - **No clear weekly pattern**
> 
> **5. Recent trend:**
> - Week 1: 3 failures
> - Week 2: 5 failures
> - Week 3: 8 failures ← INCREASING
> - Week 4: 7 failures
> 
> ---
> 
> **Root Cause Hypothesis:**
> Walk-in cooler is struggling to maintain temperature during peak midday hours (likely due to frequent door openings during lunch rush).
> 
> **Recommended Actions:**
> 1. **Immediate:** Schedule maintenance check for walk-in cooler compressor
> 2. **Short-term:** Minimize door openings during rush (consolidate trips)
> 3. **Long-term:** Consider upgrading walk-in cooler if unit is old
> 
> **Red Flag:** Failure rate is increasing week-over-week. This suggests equipment degradation, not just usage patterns.
> 
> Would you like me to:
> a) Create a maintenance action item for the Scottsdale manager
> b) Generate a full equipment health report
> c) Compare to other locations with similar volumes

---

## Example 6: Training & Onboarding

**User:**
> How do I set up a new location and assign the opening checklist to bartenders?

**AI:**
> I'll walk you through setting up a new location:
> 
> **Step 1: Create Location**
> 1. Go to Blanket → Settings → Locations
> 2. Click "Add Location"
> 3. Enter:
>    - Name: (e.g., "Postino Uptown")
>    - Address: (full address for map)
>    - Time zone: (e.g., America/Phoenix)
> 4. Click "Save"
> 
> **Step 2: Assign Users to Location**
> 1. Go to Users → [Select bartender]
> 2. Click "Edit"
> 3. Under "Locations", check the new location
> 4. Click "Save"
> 5. Repeat for all bartenders
> 
> **Step 3: Assign Opening Checklist**
> 1. Go to Lists → [Find "Bar Opening Checklist"]
> 2. Click "Edit"
> 3. Under "Assigned Locations", check the new location
> 4. Under "Assigned Positions", check "Bartender"
> 5. Set schedule: Daily at 7:00 AM
> 6. Click "Save"
> 
> ---
> 
> **Would you like me to do this for you?**
> If you provide:
> - Location name
> - Location address
> - Bartender names (or user IDs)
> 
> I can execute these steps automatically and confirm when done.

---

## Example 7: Comparison Query

**User:**
> Compare completion rates between Phoenix and Tempe locations for the past 2 weeks

**AI:**
> Comparing Phoenix vs Tempe locations (Feb 26 - March 9, 2026)...
> 
> **Phoenix Locations (3 total):**
> | Location | Completed | Total | Rate |
> |----------|-----------|-------|------|
> | Phoenix Downtown | 87 | 138 | 63% |
> | Phoenix Midtown | 104 | 128 | 81% |
> | Phoenix Uptown | 96 | 115 | 83% |
> | **Average** | **287** | **381** | **75%** |
> 
> **Tempe Locations (2 total):**
> | Location | Completed | Total | Rate |
> |----------|-----------|-------|------|
> | Tempe Mill Ave | 102 | 142 | 72% |
> | Tempe University | 118 | 135 | 87% |
> | **Average** | **220** | **277** | **79%** |
> 
> ---
> 
> **Key Insights:**
> 1. **Tempe performs better overall:** 79% vs 75% (4 percentage points higher)
> 2. **Phoenix Downtown is the outlier:** 63% (18 points below Phoenix average)
> 3. **Best performer:** Tempe University (87%)
> 4. **Worst performer:** Phoenix Downtown (63%)
> 
> **Recommendation:** Focus improvement efforts on Phoenix Downtown. Consider:
> - Shadowing Tempe University to learn best practices
> - Investigating barriers at Phoenix Downtown (see my earlier analysis)
> 
> Would you like a detailed breakdown by template type or day of week?

---

## Example 8: Quick Fact Check

**User:**
> What's the FDA-required reheating temperature for leftovers?

**AI:**
> **Answer (from Marco Pollo):**
> 
> Leftovers must be reheated to **165°F (74°C)** within 2 hours.
> 
> **Details:**
> - Measure temp with food thermometer in thickest part
> - Hold at 165°F for at least 15 seconds
> - Do NOT reheat in slow cooker (too slow, danger zone)
> - Safe methods: stovetop, oven, microwave
> 
> **Source:** FDA Food Code 3-403.11
> 
> [Need to add this as a task to your templates?]

---

## Example 9: Troubleshooting

**User:**
> The app says I don't have permission to edit the bar template. Why?

**AI:**
> Let me check your permissions...
> 
> **Your Account:**
> - Name: John Doe
> - Organization: Upward Projects
> - Role: Manager
> - Assigned Locations: Phoenix Downtown, Phoenix Midtown
> 
> **Template Details:**
> - Name: Bar Opening Checklist (Postino East)
> - Assigned Locations: Postino East, Postino Arcadia
> - Editable By: Managers (role-based)
> 
> **Issue:**
> You're trying to edit a template assigned to **Postino East**, but you only have access to **Phoenix** locations.
> 
> **Solution:**
> You have 2 options:
> 1. Ask your admin to assign you to Postino East
> 2. Create a copy of this template for your Phoenix locations
> 
> Would you like me to:
> a) Draft a message to your admin requesting access
> b) Create a copy of this template for your locations

---

These examples demonstrate the AI's ability to handle operational tasks, analytics, food safety questions, and training support — all while respecting user permissions and providing actionable guidance.
