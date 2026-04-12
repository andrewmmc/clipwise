import Foundation
import FoundationModels

@available(macOS 26.0, *)
func checkAvailability() {
    let model = SystemLanguageModel.default

    switch model.availability {
    case .available:
        print(#"{"available": true}"#)
    case .unavailable(let reason):
        let reasonString: String
        switch reason {
        case .deviceNotEligible:
            reasonString = "not_supported"
        case .modelNotReady:
            reasonString = "not_ready"
        case .appleIntelligenceNotEnabled:
            reasonString = "not_enabled"
        @unknown default:
            reasonString = "unknown"
        }
        print(#"{"available": false, "reason": "\#(reasonString)"}"#)
    }
}

@available(macOS 26.0, *)
func runInference() async {
    // Read all of stdin
    let inputData = FileHandle.standardInput.readDataToEndOfFile()

    guard let input = String(data: inputData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
          !input.isEmpty else {
        writeError("No input provided on stdin")
        exit(1)
    }

    // Split on first double newline: instructions \n\n user prompt
    let instructions: String
    let userPrompt: String

    if let separatorRange = input.range(of: "\n\n") {
        instructions = String(input[input.startIndex..<separatorRange.lowerBound])
        userPrompt = String(input[separatorRange.upperBound...])
    } else {
        instructions = ""
        userPrompt = input
    }

    guard !userPrompt.isEmpty else {
        writeError("Empty user prompt")
        exit(1)
    }

    do {
        let session = LanguageModelSession(instructions: instructions)
        let response = try await session.respond(to: userPrompt)
        let resultText = response.content

        // JSON-encode the result to handle escaping
        let output = try JSONSerialization.data(
            withJSONObject: ["result": resultText],
            options: []
        )
        if let jsonString = String(data: output, encoding: .utf8) {
            print(jsonString)
        } else {
            writeError("Failed to encode response as JSON")
            exit(1)
        }
    } catch {
        writeError("Model inference failed: \(error.localizedDescription)")
        exit(1)
    }
}

func writeError(_ message: String) {
    let escaped = message
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
    let json = #"{"error": "\#(escaped)"}"#
    FileHandle.standardError.write(Data(json.utf8))
    FileHandle.standardError.write(Data("\n".utf8))
}

// Top-level entry point
if #available(macOS 26.0, *) {
    let args = CommandLine.arguments
    if args.contains("--check-availability") {
        checkAvailability()
    } else {
        // Use a semaphore to bridge async to sync in top-level code
        let semaphore = DispatchSemaphore(value: 0)
        Task {
            await runInference()
            semaphore.signal()
        }
        semaphore.wait()
    }
} else {
    print(#"{"available": false, "reason": "not_supported"}"#)
    exit(0)
}
