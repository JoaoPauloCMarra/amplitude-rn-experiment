# Releasing

1. Configure npm trusted publishing for `amplitude-rn-experiment`.
2. Use GitHub Actions as the trusted publisher.
3. Set owner to `JoaoPauloCMarra`.
4. Set repository to `amplitude-rn-experiment`.
5. Set workflow filename to `npm-publish.yml`.
6. Leave environment empty unless GitHub environment protection is added to the workflow.
7. Run the `Publish npm` workflow with `dryRun=true` before a real release.
8. Run the `Release` workflow with `dryRun=false` to create the GitHub release.
9. Confirm the release-triggered `Publish npm` workflow publishes the package.

Manual publish dispatch is available in `Publish npm` by setting `dryRun=false`, but the normal path is release-triggered publishing.
