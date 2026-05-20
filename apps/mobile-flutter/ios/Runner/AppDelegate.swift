import Flutter
import Foundation
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private let networkPermissionPrompter = NetworkPermissionPrompter()

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let channel = FlutterMethodChannel(
      name: "one_token/local_network",
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    channel.setMethodCallHandler { [weak self] call, result in
      if call.method == "requestWirelessData" {
        let args = call.arguments as? [String: Any]
        let url = args?["url"] as? String
        self?.networkPermissionPrompter.requestWirelessData(urlString: url)
        result(true)
        return
      }
      if call.method == "openSettings" {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
          result(false)
          return
        }
        UIApplication.shared.open(url) { completed in
          result(completed)
        }
        return
      }
      result(FlutterMethodNotImplemented)
    }
  }
}

final class NetworkPermissionPrompter: NSObject {
  private var dataTask: URLSessionDataTask?

  func requestWirelessData(urlString: String?) {
    let fallback = "http://192.168.2.75:4000"
    guard let url = URL(string: urlString ?? fallback) ?? URL(string: fallback) else {
      return
    }
    var request = URLRequest(url: url)
    request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    request.timeoutInterval = 2.0
    dataTask?.cancel()
    dataTask = URLSession.shared.dataTask(with: request) { [weak self] _, _, _ in
      DispatchQueue.main.async {
        self?.dataTask = nil
      }
    }
    dataTask?.resume()
  }
}
