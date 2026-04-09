// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "LLMActionsPlugin",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "LLMActionsPlugin",
            targets: ["LLMActionsPlugin"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "LLMActionsPlugin",
            dependencies: [],
            path: "Sources"
        )
    ]
)
