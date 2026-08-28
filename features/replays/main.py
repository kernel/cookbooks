from typing import TypedDict

import kernel
from browser_use import Agent, ChatAnthropic
from kernel import Kernel
from session import BrowserSessionCustomResize

client = Kernel()

app = kernel.App("saucedemo-qa")

# Default demo target: Sauce Labs' public practice store.
# standard_user / secret_sauce are the published practice credentials
# documented on https://www.saucedemo.com/ itself.
DEFAULT_PRODUCT_URL = "https://www.saucedemo.com/inventory-item.html?id=4"
DEMO_USERNAME = "standard_user"
DEMO_PASSWORD = "secret_sauce"


class TaskInput(TypedDict):
    product_url: str


# Environment variables are set during `kernel deploy <filename> -e VAR_NAME=value`
# See https://www.kernel.sh/docs/apps/secrets
llm = ChatAnthropic(model="claude-sonnet-5")


class QAResult(TypedDict):
    product_page_replay_link: str
    cart_page_replay_link: str
    product_image_assessment: str
    cart_assessment: str


@app.action("storefront-qa-agent")
async def storefront_qa_agent(
    ctx: kernel.KernelContext, input_data: TaskInput
) -> QAResult:
    """
    🕵️ AI-powered e-commerce QA detective/agent that catches sneaky product mismatches!

    This function deploys two specialized AI agents to hunt down quality issues:
    • 🎯 Product Detective: Checks if product images actually match their titles.
    • 🛒 Cart Auditor: Verifies the added item and cart badge count are correct.

    Each agent records its investigation as a browser replay for your viewing pleasure.

    Args:
        ctx: Kernel context containing invocation information
        input_data: An object with product_url to investigate

    Returns:
        QAResult with replay links and hilarious AI verdicts on what they found
    """

    product_url = input_data.get("product_url") or DEFAULT_PRODUCT_URL

    kernel_browser = client.browsers.create(
        invocation_id=ctx.invocation_id, timeout_seconds=300
    )
    print("Kernel browser live view url: ", kernel_browser.browser_live_view_url)

    # keep_alive=True so the session survives the first agent's shutdown and can
    # be reused by the cart agent (cart state lives in the same browser).
    browser_session = BrowserSessionCustomResize(
        cdp_url=kernel_browser.cdp_ws_url, keep_alive=True
    )

    # Initialize results
    product_page_replay_link = ""
    cart_page_replay_link = ""
    product_image_assessment = ""
    cart_assessment = ""

    try:
        # Start first replay for product page
        product_replay = client.browsers.replays.start(kernel_browser.session_id)

        # Create agent for product page assessment
        product_agent = Agent(
            task=f"""
            1. Navigate to https://www.saucedemo.com/ and log in with username '{DEMO_USERNAME}' and password '{DEMO_PASSWORD}' (Sauce Labs' published practice credentials).
            2. Navigate to {product_url}.
            3. Examine the product image and title.
            4. Check if the product image accurately represents what the product title describes.
            5. Then add the item to the cart.
            6. Return your response as a single paragraph of text in this format: 'VERDICT: [PASS/FAIL] - [1-3 sentence assessment]'

            IMPORTANT OUTPUT FORMAT:
            - Use ONLY plain text - no markdown, bullets, or special formatting
            - Return EXACTLY one line/paragraph of text
            - Do NOT use **, *, #, -, •, or any other formatting characters
            - Example: "VERDICT: PASS - The product image clearly shows a backpack which matches the product title."
            """,
            llm=llm,
            browser_session=browser_session,
        )

        product_result = await product_agent.run()

        # Stop product page replay
        try:
            client.browsers.replays.stop(
                replay_id=product_replay.replay_id, id=kernel_browser.session_id
            )
            product_page_replay_link = product_replay.replay_view_url
        except Exception as e:
            print(f"Error stopping product replay: {str(e)}")
            raise

        # Extract product assessment from result
        if product_result.final_result():
            product_image_assessment = product_result.final_result()
        else:
            product_image_assessment = (
                "Error: Could not complete product image assessment"
            )

        # Start second replay for cart page
        cart_replay = client.browsers.replays.start(kernel_browser.session_id)

        # Create agent for cart page assessment
        cart_agent = Agent(
            task="""
            1. Open the cart page using the website's UI navigation (the cart icon in the top right).
            2. Once on the cart page, verify the item added in the previous step is present in the cart.
            3. Check that the cart badge count in the header matches the number of items in the cart (it should show 1).
            4. Return your response as a single paragraph of text in this format: 'VERDICT: [PASS/FAIL] - [1-3 sentence assessment]'

            IMPORTANT OUTPUT FORMAT:
            - Use ONLY plain text - no markdown, bullets, or special formatting
            - Return EXACTLY one line/paragraph of text
            - Do NOT use **, *, #, -, •, or any other formatting characters
            - Example: "VERDICT: PASS - The cart contains the expected item and the cart badge shows 1, matching the cart contents."
            """,
            llm=llm,
            browser_session=browser_session,
        )

        cart_result = await cart_agent.run()

        # Stop cart page replay
        try:
            client.browsers.replays.stop(
                replay_id=cart_replay.replay_id, id=kernel_browser.session_id
            )
            cart_page_replay_link = cart_replay.replay_view_url
        except Exception as e:
            print(f"Error stopping cart replay: {str(e)}")
            raise

        # Extract cart assessment from result
        if cart_result.final_result():
            cart_assessment = cart_result.final_result()
        else:
            cart_assessment = "Error: Could not complete cart assessment"

    except Exception as e:
        print(f"Error during QA flow: {str(e)}")
        if not product_image_assessment:
            product_image_assessment = f"Error: {str(e)}"
        if not cart_assessment:
            cart_assessment = f"Error: {str(e)}"

    finally:
        # Ensure browser session is closed
        try:
            await browser_session.close()
        except:
            pass
        # Free the paid Kernel browser rather than waiting for its timeout
        try:
            client.browsers.delete_by_id(kernel_browser.session_id)
        except Exception as e:
            print(f"Browser delete failed (will expire on timeout): {e}")

    # Return structured result
    return QAResult(
        product_page_replay_link=product_page_replay_link,
        cart_page_replay_link=cart_page_replay_link,
        product_image_assessment=product_image_assessment,
        cart_assessment=cart_assessment,
    )
