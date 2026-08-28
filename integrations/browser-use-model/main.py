import asyncio
import sys
from typing import Optional, TypedDict

import kernel
from browser_use import Agent, Browser
from browser_use.llm import ChatBrowserUse
from kernel import Kernel

client = Kernel()

app = kernel.App("bu-model-python")


class TaskInput(TypedDict):
    task: str


# Browser Use 1.0 - uses ChatBrowserUse model
# API Keys are set in the environment during `kernel deploy <filename> -e BROWSERUSE_API_KEY=XXX`
# See https://www.kernel.sh/docs/apps/secrets
llm = ChatBrowserUse()


async def run_bu_task(task: str, invocation_id: Optional[str] = None):
    """
    Executes a Browser Use agent task

    This function supports dual execution modes:
    - Action Handler Mode: Called with invocation_id from Kernel app action context
    - Local Mode: Called without invocation_id for direct script execution

    Args:
        task: The task description for the Browser Use agent
        invocation_id: Optional Kernel invocation ID to associate browser with action

    Returns:
        An object with final_result and errors properties
    """

    browser_options = {"stealth": True}
    if invocation_id:
        browser_options["invocation_id"] = invocation_id

    kernel_browser = client.browsers.create(**browser_options)
    print("Kernel browser live view url: ", kernel_browser.browser_live_view_url)

    #######################################
    # Your Browser Use implementation here
    #######################################
    try:
        browser = Browser(
            cdp_url=kernel_browser.cdp_ws_url,
            headless=False,
            window_size={"width": 1024, "height": 786},
            viewport={"width": 1024, "height": 786},
            device_scale_factor=1.0,
        )

        agent = Agent(task=task, llm=llm, browser_session=browser)
        result = await agent.run()

        if result.final_result() is not None:
            return {"final_result": result.final_result()}
        return {"errors": result.errors()}
    except Exception as error:
        print(f"Error: {error}")
        return {"errors": str(error)}
    finally:
        print("Deleting browser...")
        try:
            client.browsers.delete_by_id(kernel_browser.session_id)
        except Exception as cleanup_error:
            print(f"Browser cleanup error (likely already deleted): {cleanup_error}")


@app.action("bu-api-task")
async def bu_task(ctx: kernel.KernelContext, input_data: TaskInput):
    """
    A function that runs the new Browser Use Model with Kernel Browsers

    Args:
        ctx: Kernel context containing invocation information
        input_data: An object with a BU task

    Returns:
        An object with final_result and errors properties
    """
    return await run_bu_task(input_data["task"], ctx.invocation_id)


# Run locally if executed directly (not imported as a module)
# Execute via: python main.py "your task here"
if __name__ == "__main__":
    task = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "Compare the price of gpt-4o and DeepSeek-V3"
    )

    result = asyncio.run(run_bu_task(task))

    print("Local execution result:", result)
    sys.exit(0 if "final_result" in result else 1)
