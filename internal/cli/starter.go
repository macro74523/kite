package cli

import "github.com/kite-plus/kite/internal/kitew"

// WorkflowPath is where the deploy workflow lives, and SchedulePath the one
// that publishes scheduled posts.
var (
	WorkflowPath = kitew.Workflow
	SchedulePath = kitew.Schedule
)

// writeWorkflow puts the workflows in place and returns what it wrote.
func writeWorkflow(root, branch string) ([]string, error) {
	return kitew.WriteWorkflows(root, branch)
}
