// Note: This uses the canvas-advanced-single module, which has WASM embedded in JS
// which means there is no loading an external WASM file for tests
import * as rc from "../src/rive_advanced.mjs";
import * as rive from "../src/rive";
import { pingPongRiveFileBuffer, corruptRiveFileBuffer, loopRiveFileBuffer, oneShotRiveFileBuffer, stateMachineFileBuffer } from "./assets/bytes";

// #region setup and teardown

beforeEach(() => {
  // needed to prevent logging bad header on the corrupt file loader
  // not sure why mocking in that function does not work
  jest.spyOn(console, "error").mockImplementation(() => { });
});

afterEach(() => {});

// #endregion

// #region runtime loading

test("Runtime can be loaded using callbacks", async (done) => {
  const callback1: rive.RuntimeCallback = (runtime: rc.RiveCanvas): void => {
    expect(runtime).toBeDefined();
    expect(runtime.Fit.none).toBeDefined();
    expect(runtime.Fit.cover).toBeDefined();
    expect(runtime.Fit.none).not.toBe(runtime.Fit.cover);
  };

  const callback2: rive.RuntimeCallback = (runtime: rc.RiveCanvas): void =>
    expect(runtime).toBeDefined();

  const callback3: rive.RuntimeCallback = (runtime: rc.RiveCanvas): void => {
    expect(runtime).toBeDefined();
    done();
  };

  rive.RuntimeLoader.getInstance(callback1);
  rive.RuntimeLoader.getInstance(callback2);
  // Delay 1 second to let library load
  setTimeout(() => rive.RuntimeLoader.getInstance(callback3), 500);
});

test("Runtime can be loaded using promises", async (done) => {
  const rive1: rc.RiveCanvas = await rive.RuntimeLoader.awaitInstance();
  expect(rive1).toBeDefined();
  expect(rive1.Fit.none).toBeDefined();
  expect(rive1.Fit.cover).toBeDefined();
  expect(rive1.Fit.none).not.toBe(rive1.Fit.cover);

  const rive2 = await rive.RuntimeLoader.awaitInstance();
  expect(rive2).toBeDefined;
  expect(rive2).toBe(rive1);

  setTimeout(async () => {
    const rive3 = await rive.RuntimeLoader.awaitInstance();
    expect(rive3).toBeDefined;
    expect(rive3).toBe(rive2);
    done();
  }, 500);
});

// #endregion

// #region creating Rive objects

test("Rive objects require a src url or byte buffer", () => {
  const canvas = document.createElement("canvas");
  const badConstructor = () => {
    new rive.Rive({ canvas: canvas });
  };
  expect(badConstructor).toThrow(Error);
});

test("Rive objects initialize correctly", (done) => {
  const canvas = document.createElement("canvas");
  const r = new rive.Rive({
    canvas: canvas,
    buffer: pingPongRiveFileBuffer,
    onLoad: () => {
      expect(r).toBeDefined();
      done();
    },
    onLoadError: () => expect(false).toBeTruthy(),
  });
});

test("Corrupt Rive file cause explosions", async (done) => {
  // this test also causes two errors to be logged
  // but they seem to get logged outside the scope of the file load.
  const warningMock = jest.fn()
  const errorMock = jest.fn()
  jest.spyOn(console, "warn").mockImplementation(warningMock);
  jest.spyOn(console, "error").mockImplementation(errorMock);
  const canvas = document.createElement("canvas");

  await new Promise<void>((resolve) => {
    new rive.Rive({
      canvas: canvas,
      buffer: corruptRiveFileBuffer,
      onLoadError: () => { 
        resolve();
      }
,
      onLoad: () => { expect(false).toBeTruthy() },
    });
  });
  expect(warningMock).toBeCalledWith('Problem loading file; may be corrupt!');
  // racy should we add "waitFor"
  await new Promise((r) => setTimeout(r, 50));
  expect(errorMock).toBeCalledWith('Problem loading file; may be corrupt!');
  done();
});

// #endregion

// #region loading files

test("Multiple files can be loaded and played", (done) => {
  const canvas = document.createElement("canvas");
  let loopOccurred = false;
  let firstLoadOccurred = false;

  const r = new rive.Rive({
    canvas: canvas,
    buffer: loopRiveFileBuffer,
    autoplay: true,
    onLoad: () => {
      // Nothing should be playing whenever a file is loaded
      expect(r.isStopped).toBeFalsy();
      expect(r.isPlaying).toBeTruthy();
      if (firstLoadOccurred) {
        done();
      } else {
        firstLoadOccurred = true;
      }
    },
    onPlay: () => {
      // We expect things to start playing shortly after load
      expect(r.isStopped).toBeFalsy();
      expect(r.isPaused).toBeFalsy();
      expect(r.isPlaying).toBeTruthy();
    },
    onLoop: (event: rive.Event) => {
      expect(r.isPlaying).toBeTruthy();
      expect(loopOccurred).toBeFalsy();
      loopOccurred = true;
      // After the first loop, load a new file
      r.load({ buffer: oneShotRiveFileBuffer, autoplay: true });
    },
    onStop: (event: rive.Event) => {
      expect(r.isStopped).toBeTruthy();
      expect(r.isPlaying).toBeFalsy();
      expect(loopOccurred).toBeTruthy();
    },
  });
});

test("Layout is set to canvas dimensions if not specified", (done) => {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;

  const r = new rive.Rive({
    canvas: canvas,
    buffer: loopRiveFileBuffer,
    onLoad: () => {
      expect(r.layout.minX).toBe(0);
      expect(r.layout.minY).toBe(0);
      expect(r.layout.maxX).toBe(400);
      expect(r.layout.maxY).toBe(300);
      done();
    },
  });
});

// #endregion



// #region Rive properties

test("Rive file contents can be read", (done) => {
  const canvas = document.createElement("canvas");
  const r = new rive.Rive({
    canvas: canvas,
    buffer: stateMachineFileBuffer,
    onLoad: () => {
      const contents = r.contents;
      expect(contents).toBeDefined();
      expect(contents.artboards).toBeDefined();
      expect(contents.artboards).toHaveLength(2);
      expect(contents.artboards[0].name).toBe("MyArtboard");
      expect(contents.artboards[1].name).toBe("Artboard2");
      expect(contents.artboards[0].animations).toBeDefined();
      expect(contents.artboards[0].animations).toHaveLength(6);
      expect(contents.artboards[0].animations[0]).toBe(
        "WorkAreaPingPongAnimation"
      );
      expect(contents.artboards[0].stateMachines).toBeDefined();
      expect(contents.artboards[0].stateMachines).toHaveLength(1);
      expect(contents.artboards[0].stateMachines[0].name).toBe("StateMachine");
      expect(contents.artboards[0].stateMachines[0].inputs).toHaveLength(3);
      expect(contents.artboards[0].stateMachines[0].inputs[0].name).toBe(
        "MyNum"
      );
      expect(contents.artboards[0].stateMachines[0].inputs[0].type).toBe(
        rive.StateMachineInputType.Number
      );
      expect(contents.artboards[0].stateMachines[0].inputs[1].name).toBe(
        "MyBool"
      );
      expect(contents.artboards[0].stateMachines[0].inputs[1].type).toBe(
        rive.StateMachineInputType.Boolean
      );
      expect(contents.artboards[0].stateMachines[0].inputs[2].name).toBe(
        "MyTrig"
      );
      expect(contents.artboards[0].stateMachines[0].inputs[2].type).toBe(
        rive.StateMachineInputType.Trigger
      );
      done();
    },
  });
});

// #endregion


// #region resetting

test("Artboards can be reset back to their starting state", (done) => {
  const canvas = document.createElement("canvas");

  // Track the nr of loops
  let loopCount = 0;

  // Start up a looping animation
  const r = new rive.Rive({
    canvas: canvas,
    buffer: loopRiveFileBuffer,
    autoplay: true,
    onLoad: () => {
      // Default artboard should be selected
      expect(r.activeArtboard).toBe("New Artboard");
      // This should only ever happen once
      expect(loopCount).toBe(0);
    },
    onLoop: (event: rive.Event) => {
      if (loopCount == 0) {
        // Reset the animation; animation should continue to play
        r.reset({ autoplay: true });
      } else {
        done();
      }
      loopCount++;
    },
  });
});

// #endregion

// #region cleanup

test("Rive deletes instances on the cleanup", (done) => {
  const canvas = document.createElement("canvas");
  const r = new rive.Rive({
    canvas: canvas,
    buffer: stateMachineFileBuffer,
    autoplay: true,
    artboard: "MyArtboard",
    onLoad: () => {
      expect(r.activeArtboard).toBe("MyArtboard");
      r.cleanup();
      expect(r.activeArtboard).toBe("");
      done();
    },
  });
});

test("Rive doesn't error out when cleaning up if the file is not set yet", () => {
  const canvas = document.createElement("canvas");
  const r = new rive.Rive({
    canvas: canvas,
    buffer: stateMachineFileBuffer,
    autoplay: true,
    artboard: "MyArtboard",
  });
  r.cleanup();
});

// #endregion