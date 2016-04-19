﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Kendo.Mvc.UI;
using Microsoft.AspNet.Hosting;
using Microsoft.AspNet.Http;
using Microsoft.AspNet.Http.Features.Internal;
using Microsoft.AspNet.Mvc;
using Microsoft.Data.Entity.Design.Internal;
using Moq;
using Moq.Protected;
using Xunit;

namespace Kendo.Mvc.Tests
{
    public class ImageBrowserControllerTests
    {
        private readonly EditorImageBrowserController controller;
        private readonly Mock<EditorImageBrowserController> controllerMock;
        private readonly Mock<IDirectoryBrowser> browser;
        private readonly Mock<IDirectoryPermission> permission;
        private readonly HostingEnvironment server;
        private readonly FileBrowserEntry directory;
        private readonly FileBrowserEntry dummyFile;
        const string PATH = "/shared/";

        public ImageBrowserControllerTests()
        {
            directory = new FileBrowserEntry { Name = "name", EntryType = FileBrowserEntryType.Directory };
            dummyFile = new FileBrowserEntry() { Name = "name", EntryType = FileBrowserEntryType.File };
            browser = new Mock<IDirectoryBrowser>();
            permission = new Mock<IDirectoryPermission>();
            server = new HostingEnvironment() { WebRootPath = "rootPath" };

            browser.Setup(b => b.GetFiles(It.IsAny<string>(), It.IsAny<string>()))
                .Returns(new[] { new FileBrowserEntry { EntryType = FileBrowserEntryType.File } });
            browser.Setup(b => b.GetDirectories(It.IsAny<string>()))
                .Returns(new[] { new FileBrowserEntry { EntryType = FileBrowserEntryType.Directory } });

            permission.Setup(p => p.CanAccess(It.IsAny<string>(), It.IsAny<string>())).Returns(true);

            controllerMock = new Mock<EditorImageBrowserController>(browser.Object, permission.Object) { CallBase = true };
            controllerMock.Setup(x => x.GetFileName(It.IsAny<IFormFile>())).Returns("test.txt");
            controllerMock.SetupGet(c => c.ContentPath).Returns("Editor");
            controllerMock.Setup(x => x.Server).Returns(server);
            controllerMock.Setup(x => x.AuthorizeRead(It.IsAny<string>())).Returns(true);
            controllerMock.Setup(x => x.AuthorizeCreateDirectory(It.IsAny<string>(), It.IsAny<string>())).Returns(true);

            controller = controllerMock.Object;
        }

        [Fact]
        public void Filter_should_be_set()
        {
            controller.Filter.ShouldEqual("*.png,*.gif,*.jpg,*.jpeg");
        }

        [Fact]
        public void Read_should_throw_exception_if_AuthorizeRead_is_false()
        {
            controllerMock.Setup(c => c.AuthorizeRead(It.IsAny<string>())).Returns(false);
            Assert.Throws<Exception>(() => controller.Read(PATH));
        }

        [Fact]
        public void Read_should_return_json()
        {
            var result = controller.Read(PATH);

            result.ShouldBeType(typeof(JsonResult));
        }

        [Fact]
        public void Read_should_return_files_for_given_path()
        {
            var result = controller.Read(PATH).Value as IEnumerable<FileBrowserEntry>;

            result.Count(i => i.EntryType == FileBrowserEntryType.File).ShouldEqual(1);
        }

        [Fact]
        public void Read_should_return_directories_for_given_path()
        {
            var result = controller.Read(PATH).Value as IEnumerable<FileBrowserEntry>;

            result.Count(i => i.EntryType == FileBrowserEntryType.Directory).ShouldEqual(1);
        }

        [Fact]
        public void Upload_should_not_save_file_with_invalid_extension()
        {
            var file = new Mock<IFormFile>();
            controllerMock.Setup(x => x.GetFileName(It.IsAny<IFormFile>())).Returns("test.invalid");

            Assert.Throws<Exception>(() => controller.Upload(PATH, file.Object));
        }

        [Fact]
        public void Upload_should_throw_exception_if_AuthorizeUpload_is_false()
        {
            var file = new Mock<IFormFile>();
            controllerMock.Setup(x => x.GetFileName(It.IsAny<IFormFile>())).Returns("test.invalid");
            controllerMock.Setup(c => c.AuthorizeUpload(It.IsAny<string>(), It.IsAny<IFormFile>())).Returns(false);

            Assert.Throws<Exception>(() => controller.Upload(PATH, file.Object));
        }

        [Fact]
        public void Destroy_should_return_json()
        {
            var result = controller.Destroy(PATH, new FileBrowserEntry() { Name = "name" });

            result.ShouldBeType(typeof(JsonResult));
        }

        [Fact]
        public void Destroy_should_return_empty_content()
        {
            var result = controller.Destroy(PATH, new FileBrowserEntry() { Name = "name" }) as JsonResult;

            result.Value.ShouldEqual(new object[0]);
        }

        [Fact]
        public void Destroy_should_throw_exception_if_AuthorizeDeleteFile_is_false()
        {
            controllerMock.Setup(x => x.AuthorizeDeleteFile(It.IsAny<string>())).Returns(false);

            Assert.Throws<Exception>(() => controller.Destroy(PATH, dummyFile));
        }

        [Fact]
        public void Destroy_should_throw_exception_if_AuthorizeDeleteDirectory_is_false()
        {
            controllerMock.Setup(x => x.AuthorizeDeleteDirectory(It.IsAny<string>())).Returns(false);

            Assert.Throws<Exception>(() => controller.Destroy(PATH, directory));
        }

        [Fact]
        public void Create_should_return_json()
        {
            var result = controller.Create(PATH, dummyFile);

            result.ShouldBeType(typeof(JsonResult));
        }

        [Fact]
        public void Create_should_return_file()
        {
            var actionResult = controller.Create(PATH, dummyFile) as JsonResult;

            var result = actionResult.Value as FileBrowserEntry;

            result.ShouldEqual(dummyFile);
        }

        [Fact]
        public void Create_should_throw_exception_if_file_name_is_missing()
        {
            Assert.Throws<Exception>(() => controller.Create(PATH, new FileBrowserEntry() { EntryType = FileBrowserEntryType.File }));
        }

        [Fact]
        public void Thumbnail_should_return_null()
        {
            controller.Thumbnail(PATH).ShouldEqual(null);
        }
    }
}
